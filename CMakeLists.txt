cmake_minimum_required(VERSION 3.16)
project(RecklessDrivin C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Compiler warnings - treat these as informational, not errors, during porting
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

# Include directories
# port/mac_headers is added BEFORE system includes so our stub headers
# shadow any system headers with the same name
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

# Resource file path
set(RESOURCES_DAT "${CMAKE_SOURCE_DIR}/port/resources/resources.dat")
add_compile_definitions(RESOURCES_DAT_PATH="${RESOURCES_DAT}")

# LZRW compression library
add_library(lzrw STATIC
    port/lzrw/lzrw.c
    port/lzrw/lzrwHandleInterface.c
)

# Resources library
add_library(game_resources STATIC
    port/resources/resources.c
)
target_link_libraries(game_resources lzrw)

# Mac compatibility stubs
add_library(mac_stubs STATIC
    port/mac_stubs.c
)

# Game source files
set(GAME_SOURCES
    source/appleevents.c
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
    source/screen.c
    source/screenfx.c
    source/sound.c
    source/sprites.c
    source/textfx.c
)

# Main game executable
add_executable(reckless_drivin ${GAME_SOURCES})

target_link_libraries(reckless_drivin
    mac_stubs
    game_resources
    lzrw
    m   # libm for math functions
)

# On Linux, link pthreads and realtime clock
if(UNIX AND NOT APPLE)
    target_link_libraries(reckless_drivin rt)
endif()

# Installation
install(TARGETS reckless_drivin DESTINATION bin)
install(FILES port/resources/resources.dat DESTINATION share/reckless_drivin)

# Print build summary
message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "Resources: ${RESOURCES_DAT}")
