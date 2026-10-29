cmake_minimum_required(VERSION 3.16)
project(RecklessDrivin C)

include(CTest)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# ============================================================
# Build options
# ============================================================
option(PORT_SDL2 "Build with SDL2 backend (replaces Mac screen/input/time APIs)" ON)
option(ENABLE_DEBUG_LOG "Enable LOG: diagnostic output (sets -DDEBUG)" OFF)

if(ENABLE_DEBUG_LOG)
    add_compile_definitions(DEBUG)
    message(STATUS "Debug logging enabled (ENABLE_DEBUG_LOG=ON)")
endif()

# ============================================================
# Compiler warnings - informational only during porting
# ============================================================
if(MSVC)
    add_compile_options(/W3)
else()
    add_compile_options(
        -Wall
        -Wno-implicit-function-declaration
        -Wno-incompatible-pointer-types
        -Wno-int-conversion
        -Wno-pointer-to-int-cast
        -Wno-int-to-pointer-cast
        -Wno-unused-variable
        -Wno-unused-function
        -Wno-deprecated-declarations
        -Wno-format
    )
endif()

# ============================================================
# Include directories
# port/mac_headers is added BEFORE system includes so our stub headers
# shadow any system headers with the same name
# ============================================================
include_directories(
    BEFORE
    ${CMAKE_SOURCE_DIR}/port/mac_headers
    ${CMAKE_SOURCE_DIR}/port/lzrw
    ${CMAKE_SOURCE_DIR}/port
    ${CMAKE_SOURCE_DIR}/headers
)

# Force-include the mac_compat.h so all source files get Mac types
# without needing to modify each source file
if(MSVC)
    add_compile_options(/FI "${CMAKE_SOURCE_DIR}/port/mac_compat.h")
else()
    add_compile_options(-include "${CMAKE_SOURCE_DIR}/port/mac_compat.h")
endif()

# ============================================================
# Resource file path
# ============================================================
set(RESOURCES_DAT "${CMAKE_SOURCE_DIR}/port/resources/resources.dat")
if(NOT EMSCRIPTEN AND NOT ANDROID)
    add_compile_definitions(RESOURCES_DAT_PATH="resources.dat" SDL_MAIN_HANDLED)
endif()

# ============================================================
# LZRW compression library
# ============================================================
add_library(lzrw STATIC
    port/lzrw/lzrw.c
    port/lzrw/lzrwHandleInterface.c
)

# ============================================================
# Resources library
# ============================================================
add_library(game_resources STATIC
    port/resources/resources.c
)
target_link_libraries(game_resources lzrw)

# ============================================================
# Mac compatibility stubs
# ============================================================
add_library(mac_stubs STATIC
    port/mac_stubs.c
)

# Propagate PORT_SDL2 to the mac_stubs library so it can guard
# duplicate implementations (e.g. SndNewChannel is in sdl_platform.c
# for SDL2 builds).
if(PORT_SDL2)
    target_compile_definitions(mac_stubs PRIVATE PORT_SDL2)
endif()

# ============================================================
# Game source files
# ============================================================
set(GAME_SOURCES
    source/error.c
    source/gameendseq.c
    source/frame_scheduler.c
    source/gameframe.c
    source/gameinitexit.c

    # source/HIDAccess.c - Apple CFBundle HID loader, not needed on Linux
    source/high.c
    source/initexit.c
    source/input.c
    source/interface.c
    source/IsPortListValid.c
    source/objectCollision.c
    source/objectControl.c
    source/objectPhysics.c
    source/objects.c
    source/packs.c
    source/particlefx.c
    source/pause.c
    source/preferences.c
    source/random.c
    source/register.c
    source/renderframe.c

    # source/renderframezoom.c - functions included/duplicated in renderframe.c
    source/rle.c
    source/roaddraw.c
    source/screenfx.c
    source/scripts.c
    source/sound.c
    source/sprites.c
    source/textfx.c
    source/byteswap_packs.c
)

if(BUILD_TESTING AND NOT ANDROID AND NOT EMSCRIPTEN)
    add_executable(frame_scheduler_tests
        tests/frame_scheduler_tests.c
        source/frame_scheduler.c
    )
    target_include_directories(frame_scheduler_tests PRIVATE headers)
    if(NOT MSVC)
        target_link_libraries(frame_scheduler_tests m)
    endif()
    add_test(NAME frame_scheduler COMMAND frame_scheduler_tests)
endif()

# source/main.c provides void main() for the original Mac build.
# For PORT_SDL2 builds, sdl_platform.c provides int main() (or SDL_main on Android).
# Including both would create a duplicate symbol, so we only add source/main.c
# when NOT building with the SDL2 backend.
if(NOT PORT_SDL2)
    list(APPEND GAME_SOURCES source/main.c)
endif()

# appleevents.c uses Mac-only Apple Events API; only include it when not using
# the SDL2 port (i.e. native Mac build).  The SDL2 port provides InitAE() stub
# in mac_stubs.c.
if(NOT PORT_SDL2)
    list(APPEND GAME_SOURCES source/appleevents.c)
endif()

# ============================================================
# SDL2 backend - replaces source/screen.c and Mac-specific
# screen/input/timing APIs when PORT_SDL2 is enabled
# ============================================================
if(PORT_SDL2)
    # Find SDL2
    if(EMSCRIPTEN)
        # Emscripten bundles SDL2; use compile/link flags
        set(SDL2_CFLAGS "-s USE_SDL=2")
        set(SDL2_LDFLAGS "-s USE_SDL=2")
        set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${SDL2_CFLAGS}")
    elseif(ANDROID)
        # Android: SDL2 source provided via SDL2_SOURCE_DIR; build it as a subdir
        if(NOT SDL2_SOURCE_DIR)
            message(FATAL_ERROR "SDL2_SOURCE_DIR must be set for Android builds "
                "(pass -DSDL2_SOURCE_DIR=/path/to/SDL2-source)")
        endif()

        add_subdirectory(${SDL2_SOURCE_DIR} ${CMAKE_BINARY_DIR}/SDL2_build)
        set(SDL2_INCLUDE_DIRS ${SDL2_SOURCE_DIR}/include)
        set(SDL2_LIBRARIES SDL2)
        set(SDL2_FOUND TRUE)
        include_directories(${SDL2_INCLUDE_DIRS})
    else()
        find_package(SDL2 QUIET)
        if(TARGET SDL2::SDL2)
            set(SDL2_LIBRARIES SDL2::SDL2)
        elseif(TARGET SDL2::SDL2-static)
            set(SDL2_LIBRARIES SDL2::SDL2-static)
        endif()

        if(SDL2_FOUND)
            include_directories(${SDL2_INCLUDE_DIRS})
        else()
            # Try sdl2-config
            find_program(SDL2_CONFIG sdl2-config)

            if(SDL2_CONFIG)
                execute_process(COMMAND ${SDL2_CONFIG} --cflags
                    OUTPUT_VARIABLE SDL2_CFLAGS OUTPUT_STRIP_TRAILING_WHITESPACE)
                execute_process(COMMAND ${SDL2_CONFIG} --libs
                    OUTPUT_VARIABLE SDL2_LDFLAGS OUTPUT_STRIP_TRAILING_WHITESPACE)
                set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${SDL2_CFLAGS}")
            else()
                message(FATAL_ERROR "SDL2 not found. Install SDL2 development files or set SDL2_DIR.")
            endif()
        endif()
    endif()
endif()

if(PORT_SDL2)
    # Enable SDL2 backend
    add_compile_definitions(PORT_SDL2)

    # Add SDL2 platform implementation (replaces source/screen.c)
    list(APPEND GAME_SOURCES port/platform/sdl_platform.c)
    if(NOT EMSCRIPTEN)
        list(APPEND GAME_SOURCES port/platform/native_customisations.c)
        if(ANDROID)
            list(APPEND GAME_SOURCES port/platform/native_customisations_android.c)
        elseif(WIN32)
            list(APPEND GAME_SOURCES port/platform/native_customisations_windows.c)
            set_source_files_properties(port/platform/native_customisations_windows.c
                PROPERTIES COMPILE_DEFINITIONS MAC_COMPAT_H)
        elseif(APPLE)
            enable_language(OBJC)
            list(APPEND GAME_SOURCES port/platform/native_customisations_macos.m)
            set_source_files_properties(port/platform/native_customisations_macos.m
                PROPERTIES COMPILE_OPTIONS "-fobjc-arc" COMPILE_DEFINITIONS MAC_COMPAT_H)
        else()
            find_package(PkgConfig REQUIRED)
            pkg_check_modules(GTK3 REQUIRED IMPORTED_TARGET gtk+-3.0)
            list(APPEND GAME_SOURCES port/platform/native_customisations_linux.c)
        endif()
    endif()
    message(STATUS "Building with SDL2 backend (PORT_SDL2=ON)")
else()
    # Use original screen.c (Mac stubs only build)
    list(APPEND GAME_SOURCES source/screen.c)
    message(STATUS "Building with stub-only backend (PORT_SDL2=OFF)")
endif()

# ============================================================
# Emscripten / WASM specific settings
# ============================================================
if(EMSCRIPTEN)
    # WASM build settings - output as reckless_drivin.html (shell template)
    set(WASM_OUTPUT_NAME "reckless_drivin")
    set(CMAKE_EXECUTABLE_SUFFIX ".html")

    # Pre-load resources.dat into the virtual filesystem
    set(EMSCRIPTEN_PRELOAD_FILES
        "--preload-file ${CMAKE_SOURCE_DIR}/port/resources/resources.dat@/resources.dat"
    )

    # Memory: start with 64MB, allow growth
    # ASYNCIFY is required to support blocking C idioms (while(StillDown()),
    # WaitForPress(), etc.) in the single-threaded browser environment.
    # Without it those loops spin forever and freeze the page.
    set(EMSCRIPTEN_FLAGS
        "-s USE_SDL=2"
        "-s ALLOW_MEMORY_GROWTH=1"
        "-s INITIAL_MEMORY=67108864"
        "-s WASM=1"
        "-s EXPORTED_RUNTIME_METHODS=[ccall,cwrap]"
        "-s EXPORTED_FUNCTIONS=[_main,_set_wasm_master_volume,_rd_set_editor_launch_options,_rd_start_editor_test_drive,_rd_set_runtime_paused,_rd_set_touch_key,_rd_set_touch_controls_active]"
        "-s ASYNCIFY=1"
        "-s ASYNCIFY_STACK_SIZE=1048576"
        "-s AUDIO_WORKLET=1"
        "-s WASM_WORKERS=1"
        "-pthread"
        "--preload-file ${CMAKE_SOURCE_DIR}/port/resources/resources.dat@/resources.dat"
    )

    if(EXISTS "${CMAKE_SOURCE_DIR}/port/wasm/shell.html")
        set(EMSCRIPTEN_FLAGS ${EMSCRIPTEN_FLAGS} "--shell-file ${CMAKE_SOURCE_DIR}/port/wasm/shell.html")
    endif()

    string(JOIN " " EMSCRIPTEN_FLAGS_STR ${EMSCRIPTEN_FLAGS})

    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} ${EMSCRIPTEN_FLAGS_STR}")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -pthread")

    # For WASM, update the resource path to the virtual FS
    add_compile_definitions(RESOURCES_DAT_PATH="/resources.dat")
    add_compile_definitions(HAVE_LUA_SCRIPTING=1)
    message(STATUS "Building for WebAssembly (Emscripten) with ASYNCIFY support")
endif()

# ============================================================
# Android: build a shared library (libmain.so) loaded by SDLActivity
# Desktop/WASM: build an executable
# ============================================================
if(ANDROID)
    # Android resources: copied from APK assets to internal storage by
    # MainActivity.copyAssetIfNeeded() before SDL_main() runs.  The actual
    # full path is resolved at runtime via SDL_AndroidGetInternalStoragePath()
    # in sdl_platform.c main(); the compile-time RESOURCES_DAT_PATH is set to
    # just the filename as a last-resort fallback in Pomme_InitResources().
    add_compile_definitions(RESOURCES_DAT_PATH="resources.dat")
    message(STATUS "Building for Android (shared library)")
    add_library(main SHARED ${GAME_SOURCES})
    set(GAME_TARGET main)
else()
    add_executable(reckless_drivin ${GAME_SOURCES})
    set(GAME_TARGET reckless_drivin)
endif()

if(NOT ANDROID)
    add_compile_definitions(HAVE_LUA_SCRIPTING=1)
    # Build a pinned Lua release with the same -pthread/atomics flags as the
    # game. Fetching the source avoids relying on an installation-specific,
    # pre-populated SDK cache.
    include(FetchContent)
    if(POLICY CMP0135)
        cmake_policy(SET CMP0135 NEW)
    endif()
    FetchContent_Declare(lua_source
        URL https://www.lua.org/ftp/lua-5.5.0.tar.gz
        URL_HASH SHA512=3253d2cdc929da6438095a30d66ef16a1abdbb0ada8fee238705b3b38492f14be9553640fdca6b25661e01155ba5582032e0a2ef064e4c283e85efc0a128cabe
    )
    FetchContent_MakeAvailable(lua_source)
    set(LUA_RUNTIME_SRC_DIR "${lua_source_SOURCE_DIR}/src")
    set(LUA_RUNTIME_SOURCES
        lapi.c lcode.c lctype.c ldebug.c ldo.c ldump.c lfunc.c lgc.c llex.c
        lmem.c lobject.c lopcodes.c lparser.c lstate.c lstring.c ltable.c ltm.c
        lundump.c lvm.c lzio.c lauxlib.c lbaselib.c lcorolib.c ldblib.c liolib.c
        lmathlib.c loadlib.c loslib.c lstrlib.c ltablib.c lutf8lib.c linit.c
    )
    list(TRANSFORM LUA_RUNTIME_SOURCES PREPEND "${LUA_RUNTIME_SRC_DIR}/")
    add_library(lua_runtime_static STATIC ${LUA_RUNTIME_SOURCES})
    target_include_directories(lua_runtime_static PUBLIC "${LUA_RUNTIME_SRC_DIR}")
    target_link_libraries(${GAME_TARGET} lua_runtime_static)
    if(NOT MSVC)
        target_link_libraries(lua_runtime_static PUBLIC m)
    endif()
endif()

# ============================================================
# Link libraries (common)
# ============================================================
if(ANDROID)
    target_link_libraries(${GAME_TARGET}
        mac_stubs
        game_resources
        lzrw
        ${SDL2_LIBRARIES}
        log # Android log library
        android # Android native app glue
        m
    )
elseif(APPLE)
    # Apple ld does not understand --start-group / --end-group
    target_link_libraries(${GAME_TARGET}
        mac_stubs
        game_resources
        lzrw
        m
    )
elseif(MSVC)
    # MSVC: math is part of the CRT, no separate m.lib exists
    target_link_libraries(${GAME_TARGET}
        mac_stubs
        game_resources
        lzrw
    )
else()
    # GNU ld (Linux) supports --start-group for resolving circular references
    target_link_libraries(${GAME_TARGET}
        -Wl,--start-group
        mac_stubs
        game_resources
        lzrw
        -Wl,--end-group
        m # libm for math functions
    )
endif()

# Link SDL2 (non-Android, non-Emscripten desktop builds)
if(PORT_SDL2 AND NOT EMSCRIPTEN AND NOT ANDROID)
    if(WIN32)
        set(NATIVE_DIALOG_LIBRARIES comdlg32 user32 gdi32)
    elseif(APPLE)
        set(NATIVE_DIALOG_LIBRARIES "-framework Cocoa")
    else()
        set(NATIVE_DIALOG_LIBRARIES PkgConfig::GTK3)
    endif()
    target_link_libraries(${GAME_TARGET} ${NATIVE_DIALOG_LIBRARIES})
endif()
if(PORT_SDL2 AND NOT EMSCRIPTEN AND NOT ANDROID)
    if(SDL2_FOUND)
        target_link_libraries(${GAME_TARGET} ${SDL2_LIBRARIES})
    elseif(SDL2_LDFLAGS)
        # Parse the flags and add them
        separate_arguments(SDL2_LDFLAGS_LIST UNIX_COMMAND "${SDL2_LDFLAGS}")
        target_link_libraries(${GAME_TARGET} ${SDL2_LDFLAGS_LIST})
    endif()
endif()

# Exercise the same geometry and hit targets used by the native overlay.
if(BUILD_TESTING AND PORT_SDL2 AND NOT ANDROID AND NOT EMSCRIPTEN)
    add_executable(touch_layout_tests tests/touch_layout_tests.c)
    if(SDL2_FOUND)
        target_link_libraries(touch_layout_tests ${SDL2_LIBRARIES})
    elseif(SDL2_LDFLAGS_LIST)
        target_link_libraries(touch_layout_tests ${SDL2_LDFLAGS_LIST})
    endif()
    add_test(NAME touch_layout COMMAND touch_layout_tests)

    if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
        add_executable(native_customisations_tests
            tests/native_customisations_tests.c
            port/platform/native_customisations.c)
        target_link_libraries(native_customisations_tests PRIVATE ${SDL2_LIBRARIES} ${SDL2_LDFLAGS_LIST})
        add_test(NAME native_customisations COMMAND native_customisations_tests)
        set_tests_properties(native_customisations PROPERTIES TIMEOUT 15)
    endif()

    # Start the real SDL game and exercise collision damage in high-color mode.
    add_executable(collision_effects_tests tests/collision_effects_tests.c ${GAME_SOURCES})
    target_compile_definitions(collision_effects_tests PRIVATE RD_NO_MAIN)
    target_link_libraries(collision_effects_tests PRIVATE
        mac_stubs game_resources lzrw lua_runtime_static ${SDL2_LIBRARIES} ${SDL2_LDFLAGS_LIST} ${NATIVE_DIALOG_LIBRARIES})
    if(NOT MSVC)
        target_link_libraries(collision_effects_tests PRIVATE m)
    endif()
    add_test(NAME collision_effects COMMAND collision_effects_tests)
    set_tests_properties(collision_effects PROPERTIES
        ENVIRONMENT "SDL_VIDEODRIVER=dummy;SDL_AUDIODRIVER=dummy"
        TIMEOUT 30)
endif()

# On Linux, link pthreads and realtime clock
if(UNIX AND NOT APPLE AND NOT EMSCRIPTEN AND NOT ANDROID)
    target_link_libraries(${GAME_TARGET} rt)
endif()

# ============================================================
# Installation
# ============================================================
if(NOT ANDROID AND NOT EMSCRIPTEN)
    if(APPLE)
        set_target_properties(${GAME_TARGET} PROPERTIES
            MACOSX_BUNDLE TRUE
            MACOSX_BUNDLE_BUNDLE_NAME "Reckless Drivin"
            MACOSX_BUNDLE_GUI_IDENTIFIER "org.recklessdrivin.game")
        configure_file("${RESOURCES_DAT}" "${CMAKE_BINARY_DIR}/resources.dat" COPYONLY)
        target_sources(${GAME_TARGET} PRIVATE "${RESOURCES_DAT}")
        set_source_files_properties("${RESOURCES_DAT}" PROPERTIES
            MACOSX_PACKAGE_LOCATION Resources)
        install(TARGETS ${GAME_TARGET} BUNDLE DESTINATION .)
        # Copy SDL's dylib/framework into the installed application and rewrite
        # its install names, so the archive works without a Homebrew install.
        configure_file(cmake/InstallMacBundle.cmake.in
            "${CMAKE_BINARY_DIR}/InstallMacBundle.cmake" @ONLY)
        install(SCRIPT "${CMAKE_BINARY_DIR}/InstallMacBundle.cmake")
    else()
        install(TARGETS ${GAME_TARGET} RUNTIME DESTINATION .)
        install(FILES "${RESOURCES_DAT}" DESTINATION .)
        add_custom_command(TARGET ${GAME_TARGET} POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${RESOURCES_DAT}" "$<TARGET_FILE_DIR:${GAME_TARGET}>/resources.dat")
        if(WIN32 AND TARGET SDL2::SDL2)
            get_target_property(SDL2_TARGET_TYPE SDL2::SDL2 TYPE)
            if(SDL2_TARGET_TYPE STREQUAL "SHARED_LIBRARY")
                install(FILES "$<TARGET_FILE:SDL2::SDL2>" DESTINATION .)
                add_custom_command(TARGET ${GAME_TARGET} POST_BUILD
                    COMMAND ${CMAKE_COMMAND} -E copy_if_different
                        "$<TARGET_FILE:SDL2::SDL2>" "$<TARGET_FILE_DIR:${GAME_TARGET}>")
            endif()
        endif()
    endif()
    set(CPACK_PACKAGE_NAME "RecklessDrivin")
    set(RECKLESS_DRIVIN_PACKAGE_VERSION "0.0.0" CACHE STRING "Desktop archive version")
    set(CPACK_PACKAGE_VERSION "${RECKLESS_DRIVIN_PACKAGE_VERSION}")
    if(MSVC)
        set(CMAKE_INSTALL_SYSTEM_RUNTIME_DESTINATION .)
        include(InstallRequiredSystemLibraries)
    endif()
    install(FILES "${CMAKE_SOURCE_DIR}/port/licenses/SDL2.txt" DESTINATION licenses)
    install(FILES "${lua_source_SOURCE_DIR}/doc/readme.html"
        DESTINATION licenses RENAME Lua-readme.html)
    if(WIN32)
        set(CPACK_GENERATOR ZIP)
    else()
        set(CPACK_GENERATOR TGZ)
    endif()
    include(CPack)
endif()

# ============================================================
# Build summary
# ============================================================
message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "Resources: ${RESOURCES_DAT}")

# ============================================================
# Scripting Runtime Unit Tests
# ============================================================
option(SCRIPTING_TESTS "Build scripting unit tests" OFF)
if(SCRIPTING_TESTS)
    if(ANDROID)
        message(FATAL_ERROR "SCRIPTING_TESTS requires a desktop or WASM build")
    endif()
    add_executable(script_runtime_tests tests/script_runtime_tests.c)
    target_link_libraries(script_runtime_tests lua_runtime_static)
    # Assertions are the test harness and some contain Lua API calls.
    if(MSVC)
        target_compile_options(script_runtime_tests PRIVATE /UNDEBUG)
    else()
        target_compile_options(script_runtime_tests PRIVATE -UNDEBUG)
    endif()
    add_test(NAME script_runtime COMMAND script_runtime_tests)
endif()
