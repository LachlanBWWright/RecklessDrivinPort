/* InputSprocket.h - Apple InputSprocket stub
 *
 * InputSprocket was an Apple API for game input.
 * These are stub implementations to allow compilation.
 */
#pragma once
#include "mac_compat.h"

typedef void *ISpElementReference;
typedef void *ISpElementListReference;
typedef void *ISpDeviceReference;

/* Device classes */
enum {
    kISpDeviceClass_SpeechRecognition = 'sprc',
    kISpDeviceClass_Mouse             = 'mous',
    kISpDeviceClass_Keyboard          = 'kbrd',
    kISpDeviceClass_Joystick          = 'jstk',
    kISpDeviceClass_Gamepad           = 'gmpd'
};

typedef struct ISpElementInfo {
    OSType          theKind;
    OSType          theLabel;
    Str255          theString;
    UInt32          theFlags;
} ISpElementInfo;

typedef struct ISpNeed {
    Str255          theName;
    UInt32          theIconSuite;
    UInt32          theFlags;
    OSType          theKind;
    OSType          theLabel;
    UInt32          isReserved1;
    UInt32          isReserved2;
    UInt32          isReserved3;
} ISpNeed;

enum {
    kISpElementKind_Button   = 'butn',
    kISpElementKind_DPad     = 'dpad',
    kISpElementKind_Axis     = 'axis',
    kISpElementKind_Delta    = 'dlta',
    kISpElementKind_Movement = 'move',
    kISpElementKind_Virtual  = 'virt'
};

enum {
    kISpAxisLabel_None  = 0,
    kISpAxisLabel_XAxis = 'xaxs',
    kISpAxisLabel_YAxis = 'yaxs',
    kISpAxisLabel_ZAxis = 'zaxs'
};

enum {
    kISpButtonLabel_None = 0
};

typedef struct ISpElementEvent {
    UInt32              timeStamp;
    ISpElementReference element;
    OSType              refCon;
    UInt32              data;
} ISpElementEvent;

/* Stub functions - all return noErr or no-op */
static inline OSErr ISpStartup(void)  { return 0; }
static inline OSErr ISpShutdown(void) { return 0; }
static inline OSErr ISpResume(void)   { return 0; }
static inline OSErr ISpSuspend(void)  { return 0; }
static inline OSErr ISpStop(void)     { return 0; }

static inline NumVersion ISpGetVersion(void) {
    NumVersion v = { 0, 0, 0x10, 1 }; /* version 1.1 */
    return v;
}

static inline OSErr ISpInit(UInt32 inNumNeeds, ISpNeed **inNeeds,
                             ISpElementReference *outElements, OSType inCreator,
                             OSType inResType, long inRefCon, short inResID, UInt32 inFlags) {
    return 0;
}

static inline OSErr ISpDevices_ActivateClass(OSType inClass) { return 0; }

static inline AbsoluteTime ISpUptime(void) {
    AbsoluteTime t = {0, 0};
    return t;
}

static inline OSErr ISpTimeToMicroseconds(AbsoluteTime *inTime, UnsignedWide *outTime) {
    if (outTime) { outTime->lo = 0; outTime->hi = 0; }
    return 0;
}

static inline OSErr ISpDevices_Extract(UInt32 inCount,
                                        ISpDeviceReference *outDevices,
                                        UInt32 *outDeviceCount) {
    if (outDeviceCount) *outDeviceCount = 0;
    return 0;
}

static inline OSErr ISpElements_ExtractByKindAndLabel(UInt32 inDeviceCount,
                                                       ISpDeviceReference *inDevices,
                                                       OSType inKind, OSType inLabel,
                                                       UInt32 inCount,
                                                       ISpElementReference *outElements,
                                                       UInt32 *outElementCount) {
    if (outElementCount) *outElementCount = 0;
    return 0;
}

static inline OSErr ISpElementList_New(UInt32 inNumElementsToReserve,
                                        void *inOptions,
                                        ISpElementListReference *outElementList,
                                        UInt32 inFlags) {
    if (outElementList) *outElementList = NULL;
    return 0;
}

static inline OSErr ISpElementList_Dispose(ISpElementListReference inElementList) {
    return 0;
}

static inline OSErr ISpElementList_AddElements(ISpElementListReference inElementList,
                                                OSType inRefCon, UInt32 inCount,
                                                ISpElementReference *inElements) {
    return 0;
}

static inline OSErr ISpElementList_Flush(ISpElementListReference inElementList) {
    return 0;
}

static inline OSErr ISpElementList_GetNextEvent(ISpElementListReference inElementList,
                                                  UInt32 inEventSize,
                                                  ISpElementEvent *outEvent,
                                                  Boolean *outGotEvent) {
    if (outGotEvent) *outGotEvent = 0;
    return 0;
}

static inline OSErr ISpElement_GetSimpleState(ISpElementReference inElement,
                                               UInt32 *outState) {
    if (outState) *outState = 0;
    return 0;
}

static inline OSErr ISpElement_GetInfo(ISpElementReference inElement,
                                        ISpElementInfo *outInfo) {
    return 0;
}

static inline OSErr ISpElement_NewVirtualFromNeeds(UInt32 inCount,
                                                    ISpNeed *inNeeds,
                                                    ISpElementReference *outVirtual,
                                                    OSType inRefCon) {
    return 0;
}

static inline OSErr ISpConfigure(void *inFilterProc) { return 0; }
