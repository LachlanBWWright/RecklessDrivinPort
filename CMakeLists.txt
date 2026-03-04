cmake_minimum_required(VERSION 3.16)
project(RecklessDrivin C)

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
        -Wno-deprecated-non-prototype
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
if(EMSCRIPTEN)
    add_compile_definitions(RESOURCES_DAT_PATH="/resources.dat")
else()
    # Primary: relative path (for distributed builds where resources.dat sits next to the binary)
    add_compile_definitions(RESOURCES_DAT_PATH="resources.dat")
    # Fallback: absolute source tree path (for local dev builds)
    add_compile_definitions(RESOURCES_DAT_FALLBACK="${RESOURCES_DAT}")
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
    source/gameframe.c
    source/gameinitexit.c
    # source/HIDAccess.c - Apple CFBundle HID loader, not needed on Linux
    source/high.c
    source/initexit.c
    source/input.c
    source/interface.c
    source/IsPortListValid.c
    source/main.c
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
    source/sound.c
    source/sprites.c
    source/textfx.c
    source/byteswap_packs.c
)

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
    else()
        # Prefer static SDL2 for self-contained binaries
        option(SDL2_STATIC "Link SDL2 statically" OFF)

        find_package(SDL2 QUIET)
        if(SDL2_FOUND)
            include_directories(${SDL2_INCLUDE_DIRS})
        else()
            # Try sdl2-config
            find_program(SDL2_CONFIG sdl2-config)
            if(SDL2_CONFIG)
                if(SDL2_STATIC)
                    execute_process(COMMAND ${SDL2_CONFIG} --cflags
                        OUTPUT_VARIABLE SDL2_CFLAGS OUTPUT_STRIP_TRAILING_WHITESPACE)
                    execute_process(COMMAND ${SDL2_CONFIG} --static-libs
                        OUTPUT_VARIABLE SDL2_LDFLAGS OUTPUT_STRIP_TRAILING_WHITESPACE)
                else()
                    execute_process(COMMAND ${SDL2_CONFIG} --cflags
                        OUTPUT_VARIABLE SDL2_CFLAGS OUTPUT_STRIP_TRAILING_WHITESPACE)
                    execute_process(COMMAND ${SDL2_CONFIG} --libs
                        OUTPUT_VARIABLE SDL2_LDFLAGS OUTPUT_STRIP_TRAILING_WHITESPACE)
                endif()
                set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${SDL2_CFLAGS}")
            else()
                message(WARNING "SDL2 not found; falling back to stub-only build (PORT_SDL2=OFF)")
                set(PORT_SDL2 OFF)
            endif()
        endif()
    endif()
endif()

if(PORT_SDL2)
    # Enable SDL2 backend
    add_compile_definitions(PORT_SDL2)
    # Add SDL2 platform implementation (replaces source/screen.c)
    list(APPEND GAME_SOURCES port/platform/sdl_platform.c)
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
    set(EMSCRIPTEN_FLAGS
        "-s USE_SDL=2"
        "-s ALLOW_MEMORY_GROWTH=1"
        "-s INITIAL_MEMORY=67108864"
        "-s WASM=1"
        "-s EXPORTED_RUNTIME_METHODS=[ccall,cwrap]"
        "--preload-file ${CMAKE_SOURCE_DIR}/port/resources/resources.dat@/resources.dat"
        "--shell-file ${CMAKE_SOURCE_DIR}/port/wasm/shell.html"
    )
    string(JOIN " " EMSCRIPTEN_FLAGS_STR ${EMSCRIPTEN_FLAGS})

    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} ${EMSCRIPTEN_FLAGS_STR}")
    message(STATUS "Building for WebAssembly (Emscripten)")
endif()

# ============================================================
# Main game executable
# ============================================================
add_executable(reckless_drivin ${GAME_SOURCES})

if(NOT EMSCRIPTEN AND NOT APPLE AND NOT MSVC)
    # GNU ld needs --start-group to resolve circular deps between static libs
    target_link_libraries(reckless_drivin
        -Wl,--start-group
        mac_stubs
        game_resources
        lzrw
        -Wl,--end-group
        m
    )
else()
    target_link_libraries(reckless_drivin
        mac_stubs
        game_resources
        lzrw
    )
    if(NOT EMSCRIPTEN AND NOT MSVC)
        target_link_libraries(reckless_drivin m)
    endif()
endif()

# Link SDL2
if(PORT_SDL2 AND NOT EMSCRIPTEN)
    if(SDL2_STATIC AND TARGET SDL2::SDL2-static)
        target_link_libraries(reckless_drivin SDL2::SDL2-static SDL2::SDL2main)
    elseif(SDL2_FOUND)
        target_link_libraries(reckless_drivin ${SDL2_LIBRARIES})
    elseif(SDL2_LDFLAGS)
        # Parse the flags and add them (--static-libs if SDL2_STATIC)
        separate_arguments(SDL2_LDFLAGS_LIST UNIX_COMMAND "${SDL2_LDFLAGS}")
        target_link_libraries(reckless_drivin ${SDL2_LDFLAGS_LIST})
    endif()
endif()

# On Linux, link pthreads and realtime clock
if(UNIX AND NOT APPLE AND NOT EMSCRIPTEN)
    target_link_libraries(reckless_drivin rt)
endif()

# ============================================================
# Installation
# ============================================================
install(TARGETS reckless_drivin DESTINATION bin)
install(FILES port/resources/resources.dat DESTINATION share/reckless_drivin)

# ============================================================
# Build summary
# ============================================================
message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "Resources: ${RESOURCES_DAT}")
