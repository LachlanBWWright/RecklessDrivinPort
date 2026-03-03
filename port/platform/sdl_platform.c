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

/* Declared in gameinitexit.c - true while the game level is active */
extern int gGameOn;

/* Helper: (re)allocate the back-buffer with the given bytes-per-pixel.
 * No-ops if the buffer is already at the correct size. */
static void sdl_set_depth(int bpp)
{
    size_t needed = (size_t)gXSize * gYSize * bpp;
    short  wanted_rowbytes = (short)(gXSize * bpp);
    if (s_back_buffer && gRowBytes == wanted_rowbytes)
        return;  /* already the right depth */
    if (s_back_buffer) free(s_back_buffer);
    s_back_buffer = (UInt8 *)malloc(needed);
    if (!s_back_buffer) { fprintf(stderr, "sdl_set_depth: malloc failed\n"); exit(1); }
    memset(s_back_buffer, 0, needed);
    gBaseAddr  = (Ptr)s_back_buffer;
    gRowBytes  = wanted_rowbytes;
}

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

/* Forward declaration of audio callback processor (defined after sound manager) */
static void sdl_audio_process_callbacks(void);
static void sdl_audio_open(void);

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

/* Reverse lookup: SDL_Scancode → Mac ADB scan code (or 0xFF if not mapped) */
static uint8_t s_sdl_to_mac[SDL_NUM_SCANCODES];
static int s_sdl_to_mac_built = 0;

static void build_sdl_to_mac(void) {
    int i;
    if (s_sdl_to_mac_built) return;
    memset(s_sdl_to_mac, 0xFF, sizeof(s_sdl_to_mac));
    for (i = 0; i < 128; i++) {
        SDL_Scancode sc = s_mac_to_sdl[i];
        if (sc != SDL_SCANCODE_UNKNOWN && s_sdl_to_mac[sc] == 0xFF)
            s_sdl_to_mac[sc] = (uint8_t)i;
    }
    s_sdl_to_mac_built = 1;
}

/* ============================================================
 * GetKeys - Mac keyboard state using SDL2 keyboard state
 * ============================================================ */
void GetKeys(KeyMap theKeys) {
    unsigned char *km = (unsigned char *)theKeys;
    memset(km, 0, 16);

    /* Pump events so the keyboard state reflects keys pressed since last call */
    SDL_PumpEvents();

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
SDL_Color s_palette[256];
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

void InitScreen(int unused) {
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS | SDL_INIT_TIMER | SDL_INIT_AUDIO) < 0) {
        fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
        exit(1);
    }

    /* Initialize audio subsystem */
    sdl_audio_open();

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

    /* Allocate the initial 8-bit back-buffer.
     * The buffer may be reallocated to 16-bit in ScreenMode(kScreenRunning)
     * when hiColor gameplay starts, and back to 8-bit on kScreenSuspended. */
    sdl_set_depth(1);

    gScreenMode = kScreenSuspended;
    printf("[SDL] InitScreen: %dx%d, rowBytes=%d\n", gXSize, gYSize, gRowBytes);
}

void ScreenMode(int mode) {
    gScreenMode = mode;
    switch (mode) {
        case kScreenRunning:
            /* Switch to 16-bit back-buffer for hiColor gameplay; stay 8-bit for menus */
            if (gGameOn && gPrefs.hiColor) {
                if (gRowBytes != gXSize * 2)
                    sdl_set_depth(2);
            } else {
                if (gRowBytes != gXSize)
                    sdl_set_depth(1);
            }
            /* Load the game's 8-bit colour lookup table (same as screen.c) */
            if (!s_palette_set) {
                SetScreenClut(8);
            }
            break;
        case kScreenSuspended:
            /* Always switch back to 8-bit for menu/interface */
            if (gRowBytes != gXSize)
                sdl_set_depth(1);
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
 * The back buffer is either:
 *  - 8-bit indexed (gRowBytes == gXSize):  copy into paletted surface, blit to 32-bit
 *  - 16-bit XRGB1555 (gRowBytes == gXSize*2):  convert XRGB1555 pixels → ARGB8888
 */
void Blit2Screen(void) {
    int y;
    if (!s_renderer || !s_texture || !s_rgb_surface || !s_back_buffer)
        return;

    if (gRowBytes == gXSize) {
        /* ---- 8-bit indexed path ---- */
        if (!s_surface) return;

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
    } else {
        /* ---- 16-bit XRGB1555 hi-color path ---- */
        if (SDL_LockSurface(s_rgb_surface) == 0) {
            for (y = 0; y < gYSize; y++) {
                Uint32 *dst = (Uint32 *)((UInt8 *)s_rgb_surface->pixels
                                         + y * s_rgb_surface->pitch);
                const UInt16 *src = (const UInt16 *)(s_back_buffer + y * gRowBytes);
                int x;
                for (x = 0; x < gXSize; x++) {
                    /* Mac stored XRGB1555 big-endian; swap to native LE before extracting RGB */
                    UInt16 p = be16_swap(src[x]);
                    /* XRGB1555: bits 14-10=R, 9-5=G, 4-0=B */
                    Uint8 r = (Uint8)(((p >> 10) & 0x1F) << 3);
                    Uint8 g = (Uint8)(((p >>  5) & 0x1F) << 3);
                    Uint8 b = (Uint8)(( p        & 0x1F) << 3);
                    /* ARGB8888 */
                    dst[x] = (Uint32)(0xFF000000u | ((Uint32)r << 16)
                                      | ((Uint32)g << 8) | b);
                }
            }
            SDL_UnlockSurface(s_rgb_surface);
        }
    }

    /* Upload to texture */
    SDL_UpdateTexture(s_texture, NULL, s_rgb_surface->pixels, s_rgb_surface->pitch);

    /* Render */
    SDL_RenderClear(s_renderer);
    SDL_RenderCopy(s_renderer, s_texture, NULL, NULL);
    SDL_RenderPresent(s_renderer);

    /* Process pending sound callbacks (engine loop, etc.) during gameplay.
     * WaitNextEvent() is not called in the game loop, so we do it here. */
    sdl_audio_process_callbacks();

    /* Process quit events during gameplay (WaitNextEvent is not called in game loop) */
    {
        SDL_Event ev;
        extern int gExit;
        while (SDL_PollEvent(&ev)) {
            if (ev.type == SDL_QUIT) { gExit = 1; }
        }
    }

    /* Save screenshots when RECKLESS_SCREENSHOT_DIR env var is set.
     * Skip initial frames (menu + level load) to capture actual gameplay. */
#define SCREENSHOT_WARMUP_FRAMES 200
    {
        static int s_shot_count = 0;
        static int s_shot_skip  = 0;
        static int s_shot_done  = 0;
        const char *dir = SDL_getenv("RECKLESS_SCREENSHOT_DIR");
        if (dir && !s_shot_done && s_rgb_surface) {
            if (s_shot_skip < SCREENSHOT_WARMUP_FRAMES) {
                s_shot_skip++;
            } else {
                char path[512];
                snprintf(path, sizeof(path), "%s/native_%03d.bmp", dir, s_shot_count++);
                SDL_SaveBMP(s_rgb_surface, path);
                if (s_shot_count >= 5) s_shot_done = 1;
            }
        }
    }
#undef SCREENSHOT_WARMUP_FRAMES
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

    /* Invalidate the rgb15 → palette8 lookup cache in mac_stubs.c */
    extern void rgb15_cache_invalidate(void);
    rgb15_cache_invalidate();

    /* Load the translucence table for the new palette.
     * The 'Trtb' resource is a 256×256 byte lookup table:
     *   trTab[(fgColor << 8) | bgColor] = blended palette index
     * Sprites dereference gTranslucenceTab directly so it must be non-NULL. */
    {
        extern Handle gTranslucenceTab;
        if (gTranslucenceTab) {
            ReleaseResource(gTranslucenceTab);
            gTranslucenceTab = NULL;
        }
        gTranslucenceTab = GetResource('Trtb', (short)id);
        if (!gTranslucenceTab || !*gTranslucenceTab) {
            /* Fallback: build an identity table (no blending) */
            if (!gTranslucenceTab) gTranslucenceTab = NewHandle(65536);
            if (gTranslucenceTab && *gTranslucenceTab) {
                UInt8 *tbl = (UInt8 *)*gTranslucenceTab;
                int fg, bg;
                for (fg = 0; fg < 256; fg++)
                    for (bg = 0; bg < 256; bg++)
                        tbl[(fg << 8) | bg] = (UInt8)fg;
            }
        }
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
    /* Process pending sound callbacks first (must be on main thread) */
    sdl_audio_process_callbacks();

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
                build_sdl_to_mac();
                {
                    uint8_t mac_vk = s_sdl_to_mac[ev.key.keysym.scancode];
                    theEvent->what = keyDown;
                    /* Mac EventRecord.message: bits 15-8 = virtual key code, bits 7-0 = char code */
                    theEvent->message = (ev.key.keysym.sym & charCodeMask)
                                      | ((mac_vk != 0xFF) ? ((UInt32)mac_vk << 8) : 0);
                    theEvent->when = SDL_GetTicks();
                }
                return 1;

            case SDL_KEYUP:
                build_sdl_to_mac();
                {
                    uint8_t mac_vk = s_sdl_to_mac[ev.key.keysym.scancode];
                    theEvent->what = keyUp;
                    theEvent->message = (ev.key.keysym.sym & charCodeMask)
                                      | ((mac_vk != 0xFF) ? ((UInt32)mac_vk << 8) : 0);
                    theEvent->when = SDL_GetTicks();
                }
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
    /* Query current mouse button state directly so Button() returns the
     * actual hardware state, not the stale event-driven s_mouse_down flag.
     * This prevents WaitForPress() from exiting immediately because the
     * left button was held down during the previous click. */
    SDL_PumpEvents();
    return (Boolean)(SDL_GetMouseState(NULL, NULL) & SDL_BUTTON_LMASK);
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
 * SDL2 Sound Manager - Software mixer implementing Mac Sound Manager API
 * Supports: SndNewChannel, SndDisposeChannel, SndDoImmediate, SndDoCommand
 * Commands: bufferCmd, volumeCmd, flushCmd, quietCmd, rateMultiplierCmd,
 *           callBackCmd, rateCmd, getRateCmd
 * ============================================================ */

/*
 * Mac SoundHeader layout (stdSH, encode=0x00, 8-bit mono PCM):
 *   offset 0:  uint32 samplePtr    (0 = data inline at sampleArea)
 *   offset 4:  uint32 length       (number of samples)
 *   offset 8:  uint32 sampleRate   (16.16 fixed-point Hz)
 *   offset 12: uint32 loopStart
 *   offset 16: uint32 loopEnd
 *   offset 20: uint8  encode       (0=stdSH, 0xFF=extSH, 0xFE=cmpSH)
 *   offset 21: uint8  baseFrequency
 *   offset 22: uint8  sampleArea[] (PCM data: 8-bit unsigned offset by 128)
 *
 * Mac SoundHeader layout (extSH, encode=0xFF, 16-bit stereo PCM):
 *   offsets 0-21: same as above (length = numFrames)
 *   offset 22: uint32 numFrames
 *   offset 26: 10 bytes (extended 80-bit float sampleRate - we skip this)
 *   offset 36: uint32 markerChunk
 *   offset 40: uint32 instrumentChunks
 *   offset 44: uint32 AESRecording
 *   offset 48: uint16 sampleSize (bits per sample)
 *   offset 50: uint16 futureUse1
 *   offset 52: uint32 futureUse2
 *   offset 56: uint32 futureUse3
 *   offset 60: uint32 futureUse4
 *   offset 64: uint8  sampleArea[]
 */

/* SDL_AudioSpec for mixer */
#define SND_SAMPLE_RATE   22050
#define SND_CHANNELS      1
#define SND_BUFFER_SIZE   1024
#define MAX_SND_CHANNELS  16    /* max simultaneous Sound Manager channels */

typedef struct SndVoice {
    /* Playback position */
    const uint8_t *samples;   /* 8-bit unsigned PCM data from Mac SoundHeader (or NULL) */
    uint32_t      num_samples;
    double        pos;        /* current read position (fractional) */
    double        rate;       /* samples per output sample (= src_rate/dst_rate * multiplier) */
    double        rate_mul;   /* rateMultiplierCmd value (1.0 = normal) */
    uint32_t      src_rate;   /* sample rate from SoundHeader */

    /* Volume/pan: 0-255 range, left/right separate */
    float vol_l, vol_r;

    /* Looping */
    uint32_t loop_start, loop_end;

    /* Callback on completion */
    SndCallBackProcPtr callback;
    SndChannelPtr      chan;
    int                callback_pending;  /* 1 = fire callBackCmd at end */
    int                callback_param1;

    /* Active flag */
    int active;
} SndVoice;

/* One mixer voice per SndChannel */
static SndVoice  s_voices[MAX_SND_CHANNELS];
static int       s_voice_count = 0;     /* high-water mark of allocated slots */
static SDL_mutex *s_audio_mutex = NULL;
static int       s_audio_open   = 0;

/* -------- Helper: get voice index for a channel -------- */
static int voice_for_chan(SndChannelPtr chan) {
    if (!chan) return -1;
    int idx = (int)(intptr_t)chan->nextChan;  /* we store index in nextChan */
    if (idx < 0 || idx >= MAX_SND_CHANNELS) return -1;
    return idx;
}

/* -------- SDL audio callback -------- */
static void sdl_audio_callback(void *userdata, Uint8 *stream, int len) {
    (void)userdata;
    int n = len;  /* len is bytes; we use int16 samples */
    int16_t *out = (int16_t *)stream;
    int n_samples = n / 2;  /* stereo int16 = 4 bytes per frame; mono = 2 bytes */
    /* Actually our SDL audio is mono int16 */
    memset(out, 0, (size_t)n);

    if (!s_audio_mutex) return;
    SDL_LockMutex(s_audio_mutex);

    for (int vi = 0; vi < s_voice_count; vi++) {
        SndVoice *v = &s_voices[vi];
        if (!v->active || !v->samples || v->num_samples == 0) continue;

        for (int i = 0; i < n_samples; i++) {
            uint32_t idx = (uint32_t)v->pos;
            if (idx >= v->num_samples) {
                /* End of sample - check loop */
                if (v->loop_end > v->loop_start && v->loop_end <= v->num_samples) {
                    v->pos = v->loop_start;
                    idx = v->loop_start;
                } else {
                    v->active = 0;
                    if (v->callback_pending) {
                        /* Schedule callback to be called outside audio thread */
                        v->callback_pending = 2;  /* 2 = needs firing */
                    }
                    break;
                }
            }
            /* 8-bit unsigned PCM (range 0-255) to signed int16: convert to signed by
             * treating as uint8 (which is what Mac samples are), mapping 0-255 -> -128..127 */
            int sample = (int)((uint8_t)v->samples[idx] - 128) * 256;
            /* Apply volume */
            sample = (int)(sample * v->vol_l);
            /* Clamp and mix */
            {
                int32_t sum = (int32_t)out[i] + (int32_t)sample;
                out[i] = (int16_t)(sum > 32767 ? 32767 : sum < -32768 ? -32768 : sum);
            }
            v->pos += v->rate;
        }
    }

    SDL_UnlockMutex(s_audio_mutex);
}

/* -------- Open SDL audio device -------- */
static void sdl_audio_open(void) {
    if (s_audio_open) return;
    s_audio_mutex = SDL_CreateMutex();

    SDL_AudioSpec want, got;
    SDL_memset(&want, 0, sizeof(want));
    want.freq     = SND_SAMPLE_RATE;
    want.format   = AUDIO_S16SYS;
    want.channels = 1;      /* mono mixing */
    want.samples  = SND_BUFFER_SIZE;
    want.callback = sdl_audio_callback;
    want.userdata = NULL;

    if (SDL_OpenAudio(&want, &got) < 0) {
        fprintf(stderr, "[SDL] SDL_OpenAudio failed: %s\n", SDL_GetError());
        return;
    }
    s_audio_open = 1;
    SDL_PauseAudio(0);  /* start playback */
    printf("[SDL] Audio opened: %d Hz, format=%d, ch=%d\n",
           got.freq, got.format, got.channels);
}

/* ============================================================
 * Mac Sound Manager API implementation for SDL2 port
 * ============================================================ */

OSErr SndNewChannel(SndChannelPtr *chan, short synth, long init,
                    SndCallBackProcPtr userRoutine) {
    if (!chan) return -50;

    /* Open audio device on first channel */
    if (!s_audio_open) {
        SDL_InitSubSystem(SDL_INIT_AUDIO);
        sdl_audio_open();
    }

    /* Find a free slot: scan for a previously disposed voice (chan==NULL)
     * before allocating a new slot.  This allows InitChannels() to be
     * called multiple times without exhausting the fixed-size voice array. */
    int vi = -1;
    {
        int slot_idx;
        for (slot_idx = 0; slot_idx < s_voice_count; slot_idx++) {
            if (s_voices[slot_idx].chan == NULL) { vi = slot_idx; break; }
        }
    }
    if (vi < 0) {
        if (s_voice_count >= MAX_SND_CHANNELS) {
            fprintf(stderr, "[SDL] SndNewChannel: too many channels\n");
            return -108;
        }
        vi = s_voice_count++;
    }

    *chan = (SndChannelPtr)calloc(1, sizeof(SndChannel));
    if (!*chan) return -108;

    SndVoice *v = &s_voices[vi];
    memset(v, 0, sizeof(*v));
    v->vol_l    = 1.0f;
    v->vol_r    = 1.0f;
    v->rate_mul = 1.0;
    v->rate     = 1.0;
    v->active   = 0;
    v->callback = userRoutine;
    v->chan     = *chan;

    /* Store voice index in nextChan (we're not using it for actual linking) */
    (*chan)->nextChan = (struct SndChannel *)(intptr_t)vi;
    (*chan)->callBack  = userRoutine;
    (*chan)->userInfo  = 0;

    return 0;
}

OSErr SndDisposeChannel(SndChannelPtr chan, Boolean quietNow) {
    if (!chan) return 0;
    int vi = voice_for_chan(chan);
    if (vi >= 0 && s_audio_mutex) {
        SDL_LockMutex(s_audio_mutex);
        s_voices[vi].active   = 0;
        s_voices[vi].samples  = NULL;
        s_voices[vi].chan     = NULL;  /* mark slot as reusable */
        SDL_UnlockMutex(s_audio_mutex);
    }
    free(chan);
    return 0;
}

/* -------- Parse Mac SoundHeader and start playback -------- */
static void voice_play_buffer(SndVoice *v, const uint8_t *snd_hdr) {
    if (!snd_hdr) return;

    /* Read SoundHeader fields (big-endian) */
    uint32_t length    = ((uint32_t)snd_hdr[4]<<24)|((uint32_t)snd_hdr[5]<<16)|
                         ((uint32_t)snd_hdr[6]<<8 )|snd_hdr[7];
    uint32_t rate_fx   = ((uint32_t)snd_hdr[8]<<24)|((uint32_t)snd_hdr[9]<<16)|
                         ((uint32_t)snd_hdr[10]<<8)|snd_hdr[11];
    uint32_t loop_start= ((uint32_t)snd_hdr[12]<<24)|((uint32_t)snd_hdr[13]<<16)|
                         ((uint32_t)snd_hdr[14]<<8 )|snd_hdr[15];
    uint32_t loop_end  = ((uint32_t)snd_hdr[16]<<24)|((uint32_t)snd_hdr[17]<<16)|
                         ((uint32_t)snd_hdr[18]<<8 )|snd_hdr[19];
    uint8_t  encode    = snd_hdr[20];

    double src_rate = (double)rate_fx / 65536.0;
    if (src_rate < 100.0) src_rate = 22050.0;  /* sanity check */

    v->src_rate   = (uint32_t)src_rate;
    v->rate       = src_rate / (double)SND_SAMPLE_RATE * v->rate_mul;
    v->loop_start = loop_start;
    v->loop_end   = loop_end;
    v->pos        = 0.0;

    if (encode == 0x00) {
        /* stdSH: 8-bit mono samples at offset 22 */
        v->samples     = (const uint8_t *)(snd_hdr + 22);
        v->num_samples = length;
        v->active      = 1;
    } else if (encode == 0xFF) {
        /* extSH: 16-bit at offset 64 - not common in this game, skip for now */
        v->active = 0;
    } else {
        /* cmpSH or other - not supported */
        v->active = 0;
    }
}

OSErr SndDoImmediate(SndChannelPtr chan, const SndCommand *cmd) {
    if (!chan || !cmd) return 0;
    int vi = voice_for_chan(chan);
    if (vi < 0) return 0;
    SndVoice *v = &s_voices[vi];

    if (s_audio_mutex) SDL_LockMutex(s_audio_mutex);

    switch (cmd->cmd & 0x7FFF) {  /* strip high bit (data-offset flag) */
        case 3: /* quietCmd */
            v->active = 0;
            break;
        case 4: /* flushCmd */
            v->active = 0;
            v->callback_pending = 0;
            break;
        case 46: /* volumeCmd */
            /* param2: hi 16 bits = left, lo 16 bits = right (range 0-0x0100 = 0.0-1.0) */
            {
                uint16_t vl = (uint16_t)((cmd->param2 >> 16) & 0xFFFF);
                uint16_t vr = (uint16_t)( cmd->param2        & 0xFFFF);
                /* Mono mix: average L+R; 0x0100 = full volume */
                v->vol_l = (float)vl / 256.0f;
                v->vol_r = (float)vr / 256.0f;
                /* For mono output use average */
                if (v->vol_l == 0 && v->vol_r > 0) v->vol_l = v->vol_r;
                if (v->vol_r == 0 && v->vol_l > 0) v->vol_r = v->vol_l;
            }
            break;
        case 82: /* rateCmd */
            if (cmd->param2 > 0) {
                v->rate_mul = (double)cmd->param2 / 65536.0;
                v->rate = (double)v->src_rate / (double)SND_SAMPLE_RATE * v->rate_mul;
            }
            break;
        case 85: /* getRateCmd */
            /* param2 is pointer to UInt32 to receive the rate */
            if (cmd->param2) {
                uint32_t *dest = (uint32_t *)(intptr_t)cmd->param2;
                *dest = (uint32_t)(v->src_rate * 65536.0);
            }
            break;
        case 86: /* rateMultiplierCmd */
            if (cmd->param2 > 0) {
                v->rate_mul = (double)cmd->param2 / 65536.0;
                if (v->src_rate > 0)
                    v->rate = (double)v->src_rate / (double)SND_SAMPLE_RATE * v->rate_mul;
            }
            break;
        case 81: /* bufferCmd - immediate version plays right away */
            if (cmd->param2) {
                voice_play_buffer(v, (const uint8_t *)(intptr_t)cmd->param2);
            }
            break;
        default:
            break;
    }

    if (s_audio_mutex) SDL_UnlockMutex(s_audio_mutex);
    return 0;
}

OSErr SndDoCommand(SndChannelPtr chan, const SndCommand *cmd, Boolean noWait) {
    if (!chan || !cmd) return 0;
    int vi = voice_for_chan(chan);
    if (vi < 0) return 0;
    SndVoice *v = &s_voices[vi];

    if (s_audio_mutex) SDL_LockMutex(s_audio_mutex);

    switch (cmd->cmd & 0x7FFF) {
        case 81: /* bufferCmd */
            if (cmd->param2) {
                voice_play_buffer(v, (const uint8_t *)(intptr_t)cmd->param2);
            }
            break;
        case 13: /* callBackCmd */
            /* Schedule callback when current sound finishes */
            v->callback_pending = 1;
            v->callback_param1  = cmd->param1;
            break;
        default:
            /* Delegate to SndDoImmediate for other commands */
            if (s_audio_mutex) SDL_UnlockMutex(s_audio_mutex);
            return SndDoImmediate(chan, cmd);
    }

    if (s_audio_mutex) SDL_UnlockMutex(s_audio_mutex);
    return 0;
}

OSErr SndChannelStatus(SndChannelPtr chan, short theLength, SCStatusPtr theStatus) {
    if (theStatus) memset(theStatus, 0, theLength);
    if (!chan) return 0;
    int vi = voice_for_chan(chan);
    if (vi >= 0 && theStatus && theLength >= 4) {
        /* scChannelBusy = 0x0001 */
        if (s_voices[vi].active)
            ((uint8_t *)theStatus)[3] |= 0x01;
    }
    return 0;
}

/* -------- Process pending callbacks (called from main thread) -------- */
static void sdl_audio_process_callbacks(void) {
    if (!s_audio_mutex) return;
    SDL_LockMutex(s_audio_mutex);
    for (int vi = 0; vi < s_voice_count; vi++) {
        SndVoice *v = &s_voices[vi];
        if (v->callback_pending == 2 && v->callback && v->chan) {
            SndCallBackProcPtr cb = v->callback;
            SndChannelPtr chan = v->chan;
            SndCommand cmd;
            cmd.cmd    = 13; /* callBackCmd */
            cmd.param1 = v->callback_param1;
            cmd.param2 = 0;
            v->callback_pending = 0;
            SDL_UnlockMutex(s_audio_mutex);
            cb(chan, &cmd);
            SDL_LockMutex(s_audio_mutex);
        }
    }
    SDL_UnlockMutex(s_audio_mutex);
}

NumVersion SndSoundManagerVersion(void) {
    /* Return version 3.6 - "HQ mode" threshold is 0x03600000 */
    NumVersion v;
    v.majorRev       = 3;
    v.minorAndBugRev = 0x60;
    v.stage          = 0x80; /* final */
    v.nonRelRev      = 0;
    return v;
}

OSErr GetSoundOutputInfo(ComponentInstance ci, OSType selector, void *infoPtr) {
    (void)ci;
    if (selector == 'srat' && infoPtr) {
        /* siSampleRate: return 22050 Hz as 16.16 fixed point */
        *(uint32_t *)infoPtr = (uint32_t)(22050.0 * 65536.0);
    } else if (selector == 'srav' && infoPtr) {
        /* siSampleRateAvailable: return a SoundInfoList with our supported rate.
         * The game iterates rates.infoHandle entries looking for its desired rate,
         * then calls DisposeHandle(rates.infoHandle). We must allocate a real Handle. */
        SoundInfoList *sil = (SoundInfoList *)infoPtr;
        /* Allocate a handle with one UnsignedFixed (22050 Hz) */
        Handle h = NewHandle(sizeof(UnsignedFixed));
        if (h && *h) {
            UnsignedFixed rate22k = (UnsignedFixed)(22050.0 * 65536.0);
            memcpy(*h, &rate22k, sizeof(rate22k));
            sil->count = 1;
            sil->infoHandle = h;
        } else {
            sil->count = 0;
            sil->infoHandle = NewHandle(0); /* empty but valid handle */
        }
    }
    return 0;
}

OSErr SetSoundOutputInfo(ComponentInstance ci, OSType selector, void *infoPtr) {
    (void)ci; (void)selector; (void)infoPtr;
    return 0;
}

/* Component (FindNextComponent) - return non-NULL so SetGameVolume proceeds */
Component FindNextComponent(Component aComponent, ComponentDescription *looking) {
    (void)aComponent; (void)looking;
    /* Return a fake non-NULL component so the game enters the sound rate setup */
    return (Component)(intptr_t)1;
}

/* ============================================================
 * End SDL2 Sound Manager
 * ============================================================ */


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
    /* Process pending sound callbacks */
    sdl_audio_process_callbacks();
    if (gExit) {
        emscripten_cancel_main_loop();
        Exit();
        return;
    }
    if (gGameOn)
        GameFrame();
    else {
        Eventloop();
        /* In WASM, the canvas must be refreshed every animation frame.
         * Eventloop() only calls Blit2Screen() when responding to an event
         * (mouse move, window update, etc.), so we force a blit here to
         * ensure the canvas always shows the latest rendered frame. */
        Blit2Screen();
    }
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
