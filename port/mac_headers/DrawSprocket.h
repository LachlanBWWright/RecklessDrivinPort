/* DrawSprocket.h - Apple DrawSprocket stub
 *
 * DrawSprocket was an Apple API for full-screen game rendering.
 * On modern platforms, this is replaced by SDL/OpenGL.
 * These are stub implementations to allow compilation.
 */
#pragma once
#include "mac_compat.h"

typedef void *DSpContextReference;

typedef struct DSpContextAttributes {
    UInt32 frequency;
    UInt32 displayWidth;
    UInt32 displayHeight;
    UInt32 reserved1;
    UInt32 reserved2;
    UInt32 colorNeeds;
    CTabHandle colorTable;
    UInt32 contextOptions;
    UInt32 backBufferDepthMask;
    UInt32 displayDepthMask;
    UInt32 backBufferBestDepth;
    UInt32 displayBestDepth;
    UInt32 pageCount;
    char   gameMustConfirmSwitch;
    UInt32 reserved3[4];
} DSpContextAttributes;

enum {
    kDSpColorNeeds_None    = 0,
    kDSpColorNeeds_Request = 1,
    kDSpColorNeeds_Require = 2
};

enum {
    kDSpContextState_Active    = 0,
    kDSpContextState_Paused    = 1,
    kDSpContextState_Inactive  = 2
};

enum {
    kDSpDepthMask_1   = 1 << 0,
    kDSpDepthMask_2   = 1 << 1,
    kDSpDepthMask_4   = 1 << 2,
    kDSpDepthMask_8   = 1 << 3,
    kDSpDepthMask_16  = 1 << 4,
    kDSpDepthMask_32  = 1 << 5,
    kDSpDepthMask_All = 0xFFFFFFFF
};

enum {
    kDSpContextOption_PageFlip    = 1 << 0,
    kDSpContextOption_DontSyncVBL = 1 << 1
};

enum {
    kDSpBufferKind_Normal = 0
};

/* Stub functions */
static inline OSErr DSpStartup(void) { printf("TODO: DSpStartup\n"); return 0; }
static inline OSErr DSpShutdown(void) { printf("TODO: DSpShutdown\n"); return 0; }
static inline OSErr DSpFindBestContext(DSpContextAttributes *inDesiredAttributes,
                                        DSpContextReference *outContext) {
    printf("TODO: DSpFindBestContext\n");
    if (outContext) *outContext = NULL;
    return 0;
}
static inline OSErr DSpContext_Reserve(DSpContextReference inContext,
                                        DSpContextAttributes *inDesiredAttributes) {
    printf("TODO: DSpContext_Reserve\n");
    return 0;
}
static inline OSErr DSpContext_SetState(DSpContextReference inContext, UInt32 inState) {
    printf("TODO: DSpContext_SetState\n");
    return 0;
}
static inline OSErr DSpContext_GetBackBuffer(DSpContextReference inContext,
                                              UInt32 inBufferKind,
                                              GWorldPtr *outBackBuffer) {
    printf("TODO: DSpContext_GetBackBuffer\n");
    if (outBackBuffer) *outBackBuffer = NULL;
    return 0;
}
static inline OSErr DSpContext_SwapBuffers(DSpContextReference inContext,
                                            void *inBusyProc,
                                            void *inUserData) {
    printf("TODO: DSpContext_SwapBuffers\n");
    return 0;
}
static inline OSErr DSpContext_Release(DSpContextReference inContext) {
    printf("TODO: DSpContext_Release\n");
    return 0;
}
static inline OSErr DSpContext_GetAttributes(DSpContextReference inContext,
                                              DSpContextAttributes *outAttributes) {
    printf("TODO: DSpContext_GetAttributes\n");
    return 0;
}
static inline OSErr DSpProcessEvent(EventRecord *inEvent, Boolean *outEventWasProcessed) {
    if (outEventWasProcessed) *outEventWasProcessed = 0;
    return 0;
}
static inline OSErr DSpContext_GetFrontBuffer(DSpContextReference inContext,
                                               GWorldPtr *outFrontBuffer) {
    printf("TODO: DSpContext_GetFrontBuffer\n");
    if (outFrontBuffer) *outFrontBuffer = NULL;
    return 0;
}
static inline OSErr DSpContext_SetCLUTEntries(DSpContextReference inContext,
                                               const ColorSpec *inEntries,
                                               UInt16 firstEntry, UInt16 numEntries) {
    return 0;
}
static inline OSErr DSpContext_InvalBackBufferRect(DSpContextReference inContext,
                                                    const Rect *inRect) {
    return 0;
}
static inline OSErr DSpContext_GlobalToLocal(DSpContextReference inContext, Point *ioPoint) {
    return 0;
}
static inline OSErr DSpContext_FadeGamma(DSpContextReference inContext,
                                          long inPercentage, RgnHandle inFadeRgn) {
    return 0;
}
static inline OSErr DSpContext_FadeGammaIn(DSpContextReference inContext, void *inFade) {
    printf("TODO: DSpContext_FadeGammaIn\n");
    return 0;
}

/* Remove the duplicate CGrafPtr definition - use GrafPtr */

static inline OSErr DSpGetMouse(Point *outMouseLoc) {
    if (outMouseLoc) { outMouseLoc->h = 0; outMouseLoc->v = 0; }
    return 0;
}
