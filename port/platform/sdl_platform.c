/*
 * sdl_platform.c - SDL2-based platform backend for Reckless Drivin' port
 *
 * This file replaces the Mac OS-specific DrawSprocket/InputSprocket/Sound Manager
 * APIs with SDL2 implementations, enabling the game to run on modern platforms
 * and compile to WebAssembly via Emscripten.
 *
 * Platform functions implemented here:
 *   - Screen management (SDL_Window + SDL_Surface back buffer)
 *   - Keyboard input (Mac ADB scan code → SDL scancode mapping)
 *   - Event processing (SDL events → Mac EventRecord)
 *   - Time functions (SDL_GetTicks)
 *   - Exit/shutdown
 */

#ifdef PORT_SDL2

#include <SDL.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* Include Mac compat types */
#include "mac_compat.h"
#include "screen.h"
#include "input.h"
#include "preferences.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

/* ============================================================
 * Globals shared with the rest of the game
 * ============================================================ */

/* Screen globals (declared extern in screen.h) */
Ptr   gBaseAddr  = NULL;
short gRowBytes  = 0;
short gXSize     = 640;
short gYSize     = 480;
int   gOddLines  = 0;
Handle gTranslucenceTab = NULL;
Handle g16BitClut       = NULL;
UInt8  gLightningTab[kLightValues][256];
int    gScreenBlitSpecial = 0;

/* SDL objects */
static SDL_Window   *s_window   = NULL;
static SDL_Renderer *s_renderer = NULL;
static SDL_Texture  *s_texture  = NULL;
static SDL_Surface  *s_surface  = NULL;  /* 8-bit paletted surface (blit source) */
static SDL_Surface  *s_rgb_surface = NULL; /* 32-bit surface for upload to texture */

/*
 * Dedicated back-buffer for gBaseAddr. We keep this separate from the SDL
 * surface pixels because SDL may invalidate/relocate surface->pixels after
 * the hardware renderer is initialized (especially on OpenGL backends).
 */
static UInt8 *s_back_buffer = NULL;

/*
 * Screen GWorldImpl: a GWorldImpl struct that wraps the SDL surface pixels.
 * This allows CopyBits/GetPortBitMapForCopyBits to work with the SDL screen
 * without requiring special-case SDL_Surface handling in mac_stubs.c.
 */
typedef struct {
    PixMap  pixmap;
    UInt8  *pixels;
    int     owned;
} GWorldImpl;  /* must match definition in mac_stubs.c */

static GWorldImpl s_screen_gworld;
static int        s_screen_gworld_valid = 0;

int gScreenMode = kScreenSuspended;

/* Forward declarations from screen.c for functions we call */
void SetScreenClut(int id);
void Blit2Screen(void);
char gMessageBuffer[1024];
char *gMessagePos;
int gMessageCount;

/* ============================================================
 * Mac ADB scan code → SDL_Scancode lookup table
 * Maps Mac ADB keyboard scan codes (0-127) to SDL2 scancodes.
 * ============================================================ */
static const SDL_Scancode s_mac_to_sdl[128] = {
    /* 0x00 */ SDL_SCANCODE_A,
    /* 0x01 */ SDL_SCANCODE_S,
    /* 0x02 */ SDL_SCANCODE_D,
    /* 0x03 */ SDL_SCANCODE_F,
    /* 0x04 */ SDL_SCANCODE_H,
    /* 0x05 */ SDL_SCANCODE_G,
    /* 0x06 */ SDL_SCANCODE_Z,
    /* 0x07 */ SDL_SCANCODE_X,
    /* 0x08 */ SDL_SCANCODE_C,
    /* 0x09 */ SDL_SCANCODE_V,
    /* 0x0A */ SDL_SCANCODE_UNKNOWN,
    /* 0x0B */ SDL_SCANCODE_B,
    /* 0x0C */ SDL_SCANCODE_Q,
    /* 0x0D */ SDL_SCANCODE_W,
    /* 0x0E */ SDL_SCANCODE_E,
    /* 0x0F */ SDL_SCANCODE_R,
    /* 0x10 */ SDL_SCANCODE_Y,
    /* 0x11 */ SDL_SCANCODE_T,
    /* 0x12 */ SDL_SCANCODE_1,
    /* 0x13 */ SDL_SCANCODE_2,
    /* 0x14 */ SDL_SCANCODE_3,
    /* 0x15 */ SDL_SCANCODE_4,
    /* 0x16 */ SDL_SCANCODE_6,
    /* 0x17 */ SDL_SCANCODE_5,
    /* 0x18 */ SDL_SCANCODE_EQUALS,
    /* 0x19 */ SDL_SCANCODE_9,
    /* 0x1A */ SDL_SCANCODE_7,
    /* 0x1B */ SDL_SCANCODE_MINUS,
    /* 0x1C */ SDL_SCANCODE_8,
    /* 0x1D */ SDL_SCANCODE_0,
    /* 0x1E */ SDL_SCANCODE_RIGHTBRACKET,
    /* 0x1F */ SDL_SCANCODE_O,
    /* 0x20 */ SDL_SCANCODE_U,
    /* 0x21 */ SDL_SCANCODE_LEFTBRACKET,
    /* 0x22 */ SDL_SCANCODE_I,
    /* 0x23 */ SDL_SCANCODE_P,
    /* 0x24 */ SDL_SCANCODE_RETURN,
    /* 0x25 */ SDL_SCANCODE_L,
    /* 0x26 */ SDL_SCANCODE_J,
    /* 0x27 */ SDL_SCANCODE_APOSTROPHE,
    /* 0x28 */ SDL_SCANCODE_K,
    /* 0x29 */ SDL_SCANCODE_SEMICOLON,
    /* 0x2A */ SDL_SCANCODE_BACKSLASH,
    /* 0x2B */ SDL_SCANCODE_COMMA,
    /* 0x2C */ SDL_SCANCODE_SLASH,
    /* 0x2D */ SDL_SCANCODE_N,
    /* 0x2E */ SDL_SCANCODE_M,
    /* 0x2F */ SDL_SCANCODE_PERIOD,
    /* 0x30 */ SDL_SCANCODE_TAB,
    /* 0x31 */ SDL_SCANCODE_SPACE,
    /* 0x32 */ SDL_SCANCODE_GRAVE,
    /* 0x33 */ SDL_SCANCODE_BACKSPACE,
    /* 0x34 */ SDL_SCANCODE_UNKNOWN,
    /* 0x35 */ SDL_SCANCODE_ESCAPE,
    /* 0x36 */ SDL_SCANCODE_RGUI,
    /* 0x37 */ SDL_SCANCODE_LGUI,
    /* 0x38 */ SDL_SCANCODE_LSHIFT,
    /* 0x39 */ SDL_SCANCODE_CAPSLOCK,
    /* 0x3A */ SDL_SCANCODE_LALT,
    /* 0x3B */ SDL_SCANCODE_LCTRL,
    /* 0x3C */ SDL_SCANCODE_RSHIFT,
    /* 0x3D */ SDL_SCANCODE_RALT,
    /* 0x3E */ SDL_SCANCODE_RCTRL,
    /* 0x3F */ SDL_SCANCODE_APPLICATION, /* Fn key → Application */
    /* 0x40 */ SDL_SCANCODE_F17,
    /* 0x41 */ SDL_SCANCODE_KP_PERIOD,
    /* 0x42 */ SDL_SCANCODE_UNKNOWN,
    /* 0x43 */ SDL_SCANCODE_KP_MULTIPLY,
    /* 0x44 */ SDL_SCANCODE_UNKNOWN,
    /* 0x45 */ SDL_SCANCODE_KP_PLUS,
    /* 0x46 */ SDL_SCANCODE_UNKNOWN,
    /* 0x47 */ SDL_SCANCODE_NUMLOCKCLEAR,
    /* 0x48 */ SDL_SCANCODE_VOLUMEUP,
    /* 0x49 */ SDL_SCANCODE_VOLUMEDOWN,
    /* 0x4A */ SDL_SCANCODE_MUTE,
    /* 0x4B */ SDL_SCANCODE_KP_DIVIDE,
    /* 0x4C */ SDL_SCANCODE_KP_ENTER,
    /* 0x4D */ SDL_SCANCODE_UNKNOWN,
    /* 0x4E */ SDL_SCANCODE_KP_MINUS,
    /* 0x4F */ SDL_SCANCODE_F18,
    /* 0x50 */ SDL_SCANCODE_F19,
    /* 0x51 */ SDL_SCANCODE_KP_EQUALS,
    /* 0x52 */ SDL_SCANCODE_KP_0,
    /* 0x53 */ SDL_SCANCODE_KP_1,
    /* 0x54 */ SDL_SCANCODE_KP_2,
    /* 0x55 */ SDL_SCANCODE_KP_3,
    /* 0x56 */ SDL_SCANCODE_KP_4,
    /* 0x57 */ SDL_SCANCODE_KP_5,
    /* 0x58 */ SDL_SCANCODE_KP_6,
    /* 0x59 */ SDL_SCANCODE_KP_7,
    /* 0x5A */ SDL_SCANCODE_F20,
    /* 0x5B */ SDL_SCANCODE_KP_8,
    /* 0x5C */ SDL_SCANCODE_KP_9,
    /* 0x5D */ SDL_SCANCODE_UNKNOWN,
    /* 0x5E */ SDL_SCANCODE_UNKNOWN,
    /* 0x5F */ SDL_SCANCODE_UNKNOWN,
    /* 0x60 */ SDL_SCANCODE_F5,
    /* 0x61 */ SDL_SCANCODE_F6,
    /* 0x62 */ SDL_SCANCODE_F7,
    /* 0x63 */ SDL_SCANCODE_F3,
    /* 0x64 */ SDL_SCANCODE_F8,
    /* 0x65 */ SDL_SCANCODE_F9,
    /* 0x66 */ SDL_SCANCODE_UNKNOWN,
    /* 0x67 */ SDL_SCANCODE_F11,
    /* 0x68 */ SDL_SCANCODE_UNKNOWN,
    /* 0x69 */ SDL_SCANCODE_PRINTSCREEN, /* F13 */
    /* 0x6A */ SDL_SCANCODE_F16,
    /* 0x6B */ SDL_SCANCODE_SCROLLLOCK,  /* F14 */
    /* 0x6C */ SDL_SCANCODE_UNKNOWN,
    /* 0x6D */ SDL_SCANCODE_F10,
    /* 0x6E */ SDL_SCANCODE_UNKNOWN,
    /* 0x6F */ SDL_SCANCODE_F12,
    /* 0x70 */ SDL_SCANCODE_UNKNOWN,
    /* 0x71 */ SDL_SCANCODE_PAUSE,       /* F15 */
    /* 0x72 */ SDL_SCANCODE_INSERT,      /* Help key */
    /* 0x73 */ SDL_SCANCODE_HOME,
    /* 0x74 */ SDL_SCANCODE_PAGEUP,
    /* 0x75 */ SDL_SCANCODE_DELETE,
    /* 0x76 */ SDL_SCANCODE_F4,
    /* 0x77 */ SDL_SCANCODE_END,
    /* 0x78 */ SDL_SCANCODE_F2,
    /* 0x79 */ SDL_SCANCODE_PAGEDOWN,
    /* 0x7A */ SDL_SCANCODE_F1,
    /* 0x7B */ SDL_SCANCODE_LEFT,
    /* 0x7C */ SDL_SCANCODE_RIGHT,
    /* 0x7D */ SDL_SCANCODE_DOWN,
    /* 0x7E */ SDL_SCANCODE_UP,
    /* 0x7F */ SDL_SCANCODE_UNKNOWN,
};

/* ============================================================
 * GetKeys - Mac keyboard state using SDL2 keyboard state
 * ============================================================ */
void GetKeys(KeyMap theKeys) {
    unsigned char *km = (unsigned char *)theKeys;
    memset(km, 0, 16);

    int numKeys = 0;
    const Uint8 *sdl_keys = SDL_GetKeyboardState(&numKeys);

    /* For each Mac scan code, check if the corresponding SDL key is pressed */
    int i;
    for (i = 0; i < 128; i++) {
        SDL_Scancode sc = s_mac_to_sdl[i];
        if (sc != SDL_SCANCODE_UNKNOWN && sc < numKeys && sdl_keys[sc]) {
            km[i >> 3] |= (1 << (i & 7));
        }
    }
}

/* ============================================================
 * Screen management
 * ============================================================ */

/* The game's internal color palette (8-bit indexed colors) */
static SDL_Color s_palette[256];
static int s_palette_set = 0;

/* Set palette colors for 8-bit mode */
void SDL_Platform_SetPalette(int index, int count, UInt16 *rgbValues) {
    int i;
    for (i = 0; i < count && (index + i) < 256; i++) {
        /* Mac RGB values are 0-65535, SDL wants 0-255 */
        s_palette[index + i].r = rgbValues[i * 3 + 0] >> 8;
        s_palette[index + i].g = rgbValues[i * 3 + 1] >> 8;
        s_palette[index + i].b = rgbValues[i * 3 + 2] >> 8;
        s_palette[index + i].a = 255;
    }
    s_palette_set = 1;
    if (s_surface) {
        SDL_SetPaletteColors(s_surface->format->palette, s_palette, 0, 256);
    }
}

void InitScreen(int dummy) {
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS | SDL_INIT_TIMER) < 0) {
        fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
        exit(1);
    }

    gXSize = 640;
    gYSize = 480;

    s_window = SDL_CreateWindow(
        "Reckless Drivin'",
        SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
        gXSize, gYSize,
        SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE
    );
    if (!s_window) {
        fprintf(stderr, "SDL_CreateWindow failed: %s\n", SDL_GetError());
        exit(1);
    }

    s_renderer = SDL_CreateRenderer(s_window, -1,
        SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
    if (!s_renderer) {
        /* Fall back to software renderer */
        s_renderer = SDL_CreateRenderer(s_window, -1, SDL_RENDERER_SOFTWARE);
        if (!s_renderer) {
            fprintf(stderr, "SDL_CreateRenderer failed: %s\n", SDL_GetError());
            exit(1);
        }
    }

    /* Create an 8-bit indexed surface as the back buffer */
    s_surface = SDL_CreateRGBSurface(0, gXSize, gYSize, 8, 0, 0, 0, 0);
    if (!s_surface) {
        fprintf(stderr, "SDL_CreateRGBSurface (8-bit) failed: %s\n", SDL_GetError());
        exit(1);
    }

    /* Set a default grayscale palette */
    {
        int i;
        for (i = 0; i < 256; i++) {
            s_palette[i].r = i;
            s_palette[i].g = i;
            s_palette[i].b = i;
            s_palette[i].a = 255;
        }
        SDL_SetPaletteColors(s_surface->format->palette, s_palette, 0, 256);
    }

    /* Create a 32-bit RGB surface for uploading to the texture */
    s_rgb_surface = SDL_CreateRGBSurface(0, gXSize, gYSize, 32,
        0x00FF0000, 0x0000FF00, 0x000000FF, 0xFF000000);
    if (!s_rgb_surface) {
        fprintf(stderr, "SDL_CreateRGBSurface (32-bit) failed: %s\n", SDL_GetError());
        exit(1);
    }

    /* Create the streaming texture */
    s_texture = SDL_CreateTexture(s_renderer,
        SDL_PIXELFORMAT_ARGB8888,
        SDL_TEXTUREACCESS_STREAMING,
        gXSize, gYSize);
    if (!s_texture) {
        fprintf(stderr, "SDL_CreateTexture failed: %s\n", SDL_GetError());
        exit(1);
    }

    /* Allocate a dedicated back-buffer that won't be moved by the SDL renderer */
    if (s_back_buffer) free(s_back_buffer);
    s_back_buffer = (UInt8 *)malloc((size_t)gXSize * gYSize);
    if (!s_back_buffer) {
        fprintf(stderr, "Failed to allocate back buffer\n");
        exit(1);
    }
    memset(s_back_buffer, 0, (size_t)gXSize * gYSize);

    gBaseAddr = (Ptr)s_back_buffer;
    gRowBytes = gXSize;  /* stride = width for our packed back buffer */

    gScreenMode = kScreenSuspended;
    printf("[SDL] InitScreen: %dx%d, rowBytes=%d\n", gXSize, gYSize, gRowBytes);
}

void ScreenMode(int mode) {
    gScreenMode = mode;
    switch (mode) {
        case kScreenRunning:
            /* Keep gBaseAddr pointing at our dedicated back buffer */
            if (s_back_buffer) {
                gBaseAddr = (Ptr)s_back_buffer;
                gRowBytes = gXSize;
            }
            /* Load the game's 8-bit colour lookup table (same as screen.c) */
            if (!s_palette_set) {
                SetScreenClut(8);
            }
            break;
        case kScreenStopped:
            /* Clean up SDL resources */
            if (s_texture)    { SDL_DestroyTexture(s_texture);   s_texture = NULL; }
            if (s_rgb_surface){ SDL_FreeSurface(s_rgb_surface);  s_rgb_surface = NULL; }
            if (s_surface)    { SDL_FreeSurface(s_surface);      s_surface = NULL; }
            if (s_renderer)   { SDL_DestroyRenderer(s_renderer); s_renderer = NULL; }
            if (s_window)     { SDL_DestroyWindow(s_window);     s_window = NULL; }
            if (s_back_buffer){ free(s_back_buffer);             s_back_buffer = NULL; }
            SDL_Quit();
            break;
        default:
            break;
    }
}

/* GWorldPtr stub - return a GWorldImpl wrapping our SDL surface */
GWorldPtr GetScreenGW(void) {
    if (!s_surface) return NULL;
    /* Keep the screen GWorldImpl in sync with the SDL surface */
    s_screen_gworld.pixels = (UInt8 *)gBaseAddr;
    s_screen_gworld.owned  = 0;
    s_screen_gworld.pixmap.baseAddr  = gBaseAddr;
    s_screen_gworld.pixmap.rowBytes  = (short)gRowBytes | (short)0x8000;
    s_screen_gworld.pixmap.bounds.left   = 0;
    s_screen_gworld.pixmap.bounds.top    = 0;
    s_screen_gworld.pixmap.bounds.right  = (short)gXSize;
    s_screen_gworld.pixmap.bounds.bottom = (short)gYSize;
    s_screen_gworld.pixmap.pixelSize = 8;
    s_screen_gworld_valid = 1;
    return (GWorldPtr)&s_screen_gworld;
}

void FadeScreen(int out) {
    /* On fade-in (out=0): present whatever is in the back buffer */
    if (!out) Blit2Screen();
}

/*
 * Blit2Screen - present the game's back buffer (gBaseAddr) to the SDL window.
 * The back buffer is a separate 8-bit indexed allocation; we copy it into the
 * paletted SDL surface, blit that to a 32-bit surface, upload to texture, render.
 */
void Blit2Screen(void) {
    int y;
    if (!s_surface || !s_renderer || !s_texture || !s_rgb_surface || !s_back_buffer)
        return;

    /* Make sure the palette is current on the surface */
    if (s_palette_set) {
        SDL_SetPaletteColors(s_surface->format->palette, s_palette, 0, 256);
    }

    /* Copy our back buffer into the SDL paletted surface */
    if (SDL_LockSurface(s_surface) == 0) {
        for (y = 0; y < gYSize; y++) {
            UInt8 *dst = (UInt8 *)s_surface->pixels + y * s_surface->pitch;
            const UInt8 *src = s_back_buffer + y * gXSize;
            memcpy(dst, src, (size_t)gXSize);
        }
        SDL_UnlockSurface(s_surface);
    }

    /* Convert 8-bit indexed → 32-bit ARGB */
    SDL_BlitSurface(s_surface, NULL, s_rgb_surface, NULL);

    /* Upload to texture */
    SDL_UpdateTexture(s_texture, NULL, s_rgb_surface->pixels, s_rgb_surface->pitch);

    /* Render */
    SDL_RenderClear(s_renderer);
    SDL_RenderCopy(s_renderer, s_texture, NULL, NULL);
    SDL_RenderPresent(s_renderer);
}

/* SetScreenClut - set palette from color table resource */
void SetScreenClut(int id) {
    /* For hi-color mode, nothing to do; for 8-bit mode, load the color table */
    CTabHandle ct = GetCTable(id);
    if (!ct || !*ct) return;

    int i;
    ColorTable *ctab = *ct;
    for (i = 0; i <= ctab->ctSize && i < 256; i++) {
        s_palette[i].r = ctab->ctTable[i].rgb.red   >> 8;
        s_palette[i].g = ctab->ctTable[i].rgb.green >> 8;
        s_palette[i].b = ctab->ctTable[i].rgb.blue  >> 8;
        s_palette[i].a = 255;
    }
    s_palette_set = 1;
    if (s_surface) {
        SDL_SetPaletteColors(s_surface->format->palette, s_palette, 0, 256);
    }

    /* Build lightning table (same as original code) */
    if (ct && *ct) {
        long bright, color, bestScore, bestIndex, score, testIndex;
        RGBColor optColor, testColor;
        ColorTable *tbl = *ct;
        for (bright = 0; bright < kLightValues; bright++) {
            for (color = 0; color < 256; color++) {
                bestScore = 3 * 65536;
                bestIndex = 0;
                optColor = tbl->ctTable[color].rgb;
                {
                    float fade = (float)bright / kLightValues;
                    optColor.red   = (UInt16)(fade * optColor.red);
                    optColor.green = (UInt16)(fade * optColor.green);
                    optColor.blue  = (UInt16)(fade * optColor.blue);
                }
                for (testIndex = 0; testIndex < 256; testIndex++) {
                    testColor = tbl->ctTable[testIndex].rgb;
                    score = __abs((int)optColor.red   - (int)testColor.red)
                          + __abs((int)optColor.green - (int)testColor.green)
                          + __abs((int)optColor.blue  - (int)testColor.blue);
                    if (score < bestScore) {
                        bestScore = score;
                        bestIndex = testIndex;
                    }
                }
                gLightningTab[bright][color] = (UInt8)bestIndex;
            }
        }
    }
    DisposeCTable(ct);
}

/* ============================================================
 * Time management
 * ============================================================
 * GetMSTime() is defined in source/input.c (which uses SDL_GetTicks64
 * when PORT_SDL2 is defined). The following provide the Mac-style
 * time APIs needed by the rest of the code.
 */
AbsoluteTime UpTime(void) {
    Uint64 ms = SDL_GetTicks64();
    Uint64 us = ms * 1000ULL;
    AbsoluteTime at;
    at.lo = (UInt32)(us & 0xFFFFFFFF);
    at.hi = (UInt32)(us >> 32);
    return at;
}

Nanoseconds AbsoluteToNanoseconds(AbsoluteTime a) {
    return a;
}

void Microseconds(UnsignedWide *microTickCount) {
    Uint64 us = SDL_GetTicks64() * 1000ULL;
    if (microTickCount) {
        microTickCount->lo = (UInt32)(us & 0xFFFFFFFF);
        microTickCount->hi = (UInt32)(us >> 32);
    }
}

UInt32 TickCount(void) {
    return (UInt32)(SDL_GetTicks64() * 60 / 1000); /* 60 ticks per second */
}

/* ============================================================
 * Event processing
 * ============================================================ */

/* SDL event queue → Mac EventRecord bridge */
static SDL_Event s_pending_event;
static int s_has_pending = 0;

/* Current mouse position */
static int s_mouse_x = 0, s_mouse_y = 0;
static int s_mouse_down = 0;

extern int gExit; /* declared in interface.h or gameframe.h */

Boolean WaitNextEvent(short eventMask, EventRecord *theEvent, long sleep, void *mouseRgn) {
    SDL_Event ev;
    if (!theEvent) return 0;
    memset(theEvent, 0, sizeof(EventRecord));
    theEvent->what = nullEvent;

    /* Process pending SDL events */
    while (SDL_PollEvent(&ev)) {
        switch (ev.type) {
            case SDL_QUIT:
                theEvent->what = kHighLevelEvent;
                gExit = 1;
                return 1;

            case SDL_KEYDOWN:
                theEvent->what = keyDown;
                theEvent->message = (ev.key.keysym.sym & charCodeMask);
                theEvent->when = SDL_GetTicks();
                return 1;

            case SDL_KEYUP:
                theEvent->what = keyUp;
                theEvent->message = (ev.key.keysym.sym & charCodeMask);
                theEvent->when = SDL_GetTicks();
                return 1;

            case SDL_MOUSEBUTTONDOWN:
                s_mouse_x = ev.button.x;
                s_mouse_y = ev.button.y;
                s_mouse_down = 1;
                theEvent->what = mouseDown;
                theEvent->where.h = (short)s_mouse_x;
                theEvent->where.v = (short)s_mouse_y;
                theEvent->when = SDL_GetTicks();
                return 1;

            case SDL_MOUSEBUTTONUP:
                s_mouse_x = ev.button.x;
                s_mouse_y = ev.button.y;
                s_mouse_down = 0;
                theEvent->what = mouseUp;
                theEvent->where.h = (short)s_mouse_x;
                theEvent->where.v = (short)s_mouse_y;
                theEvent->when = SDL_GetTicks();
                return 1;

            case SDL_MOUSEMOTION:
                s_mouse_x = ev.motion.x;
                s_mouse_y = ev.motion.y;
                {
                    /* mouseMovedMessage osEvt */
                    theEvent->what = osEvt;
                    theEvent->message = ((UInt32)mouseMovedMessage << 24);
                    theEvent->where.h = (short)s_mouse_x;
                    theEvent->where.v = (short)s_mouse_y;
                    theEvent->when = SDL_GetTicks();
                }
                return 1;

            default:
                break;
        }
    }

    /* No event - short sleep */
    if (sleep > 0) SDL_Delay(1);
    return 0;
}

void FlushEvents(short eventMask, short stopMask) {
    SDL_FlushEvents(SDL_FIRSTEVENT, SDL_LASTEVENT);
}

Boolean Button(void) {
    return (Boolean)s_mouse_down;
}

Boolean StillDown(void) {
    SDL_PumpEvents();
    Uint32 buttons = SDL_GetMouseState(NULL, NULL);
    return (Boolean)(buttons & SDL_BUTTON_LMASK);
}

Point GetScreenPos(Point *inPos) {
    Point pos;
    if (inPos) {
        pos = *inPos;
    } else {
        int mx, my;
        SDL_GetMouseState(&mx, &my);
        pos.h = (short)mx;
        pos.v = (short)my;
    }
    return pos;
}

/* ============================================================
 * Exit
 * ============================================================ */
void ExitToShell(void) {
    if (s_texture)    SDL_DestroyTexture(s_texture);
    if (s_rgb_surface)SDL_FreeSurface(s_rgb_surface);
    if (s_surface)    SDL_FreeSurface(s_surface);
    if (s_renderer)   SDL_DestroyRenderer(s_renderer);
    if (s_window)     SDL_DestroyWindow(s_window);
    SDL_Quit();
    exit(0);
}

/* ============================================================
 * Screen message buffer (from screen.c - duplicated here for SDL build)
 * These functions are defined in screen.c in the original, but reference
 * Mac-specific QuickDraw calls. We provide SDL-friendly stubs.
 * ============================================================ */
void FlushMessageBuffer(void) {
    gMessagePos = gMessageBuffer + 1;
    gMessageCount = 0;
}

void AddFloatToMessageBuffer(StringPtr label, float value) {
    /* TODO: render debug text with SDL2_ttf */
    (void)label; (void)value;
}

/* ============================================================
 * WASM / Emscripten main loop support
 * ============================================================ */
#ifdef __EMSCRIPTEN__

/* Include the game's main loop headers */
#include "gameframe.h"
#include "interface.h"
#include "gameinitexit.h"
#include "initexit.h"

static int s_initialized = 0;

/* Called once per frame by Emscripten */
static void emscripten_main_loop(void) {
    if (!s_initialized) return;
    extern int gGameOn;
    extern int gExit;
    if (gExit) {
        emscripten_cancel_main_loop();
        Exit();
        return;
    }
    if (gGameOn)
        GameFrame();
    else
        Eventloop();
}

/* WASM entry point - called from JS after page loads */
int main(int argc, char *argv[]) {
    (void)argc; (void)argv;
    Init();
    s_initialized = 1;
    /* 0 = use browser's requestAnimationFrame (60fps), simulate_infinite_loop=1 */
    emscripten_set_main_loop(emscripten_main_loop, 0, 1);
    return 0;
}

#endif /* __EMSCRIPTEN__ */

#endif /* PORT_SDL2 */
