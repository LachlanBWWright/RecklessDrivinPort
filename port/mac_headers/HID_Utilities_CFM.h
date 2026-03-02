/* HID_Utilities_CFM.h - Apple HID Utilities CFM stub
 * 
 * Apple's HID utilities were used for gamepad access on classic Mac OS.
 * These are stubs to allow compilation.
 */
#pragma once
#include "mac_compat.h"
#include <stdio.h>

typedef unsigned long HIDElementTypeMask;

enum {
    kHIDElementTypeInput_Misc        = 1,
    kHIDElementTypeInput_Button      = 2,
    kHIDElementTypeInput_Axis        = 4,
    kHIDElementTypeInput_ScanCodes   = 8,
    kHIDElementTypeOutput            = 16,
    kHIDElementTypeFeature           = 32,
    kHIDElementTypeCollection        = 64,
    kHIDElementTypeIO                = (kHIDElementTypeInput_Misc |
                                        kHIDElementTypeInput_Button |
                                        kHIDElementTypeInput_Axis |
                                        kHIDElementTypeInput_ScanCodes |
                                        kHIDElementTypeOutput |
                                        kHIDElementTypeFeature),
    kHIDElementTypeAll               = kHIDElementTypeIO | kHIDElementTypeCollection,
    /* alias used in input.c */
    kHIDElementTypeInput             = kHIDElementTypeIO
};

struct recElement;
typedef struct recElement *pRecElement;

struct recDevice;
typedef struct recDevice *pRecDevice;

struct recElement {
    unsigned long   type;
    long            usagePage;
    long            usage;
    void *          cookie;
    long            min;
    long            max;
    long            scaledMin;
    long            scaledMax;
    long            size;
    unsigned char   relative;
    unsigned char   wrapping;
    unsigned char   nonLinear;
    unsigned char   preferredState;
    unsigned char   nullState;
    long            calMin;
    long            calMax;
    long            userMin;
    long            userMax;
    pRecElement     pPrevious;
    pRecElement     pChild;
    pRecElement     pSibling;
    char            name[256];
    long            depth;
};

struct recDevice {
    void *          interface;
    void *          queue;
    void *          queueRunLoopSource;
    void *          runLoop;
    char            transport[256];
    long            vendorID;
    long            productID;
    long            version;
    char            manufacturer[256];
    char            product[256];
    char            serial[256];
    long            locID;
    long            usage;
    long            usagePage;
    long            totalElements;
    long            features;
    long            inputs;
    long            outputs;
    long            collections;
    long            axis;
    long            buttons;
    long            hats;
    long            sliders;
    long            dials;
    long            wheels;
    pRecElement     pListElements;
    pRecDevice      pNext;
};

/* Function declarations - stubs provided when HIDAccess.c is not compiled */
#ifndef HIDACCESS_C_INCLUDED

static inline unsigned char HIDBuildDeviceList(unsigned long usagePage, unsigned long usage) {
    return 0;
}
static inline void HIDReleaseDeviceList(void) { }
static inline unsigned char HIDHaveDeviceList(void) { return 0; }
static inline unsigned long HIDCountDevices(void) { return 0; }
static inline unsigned long HIDCountDeviceElements(pRecDevice pDevice, HIDElementTypeMask typeMask) { return 0; }
static inline pRecDevice HIDGetFirstDevice(void) { return NULL; }
static inline pRecDevice HIDGetNextDevice(pRecDevice pDevice) { return NULL; }
static inline pRecElement HIDGetFirstDeviceElement(pRecDevice pDevice, HIDElementTypeMask typeMask) { return NULL; }
static inline pRecElement HIDGetNextDeviceElement(pRecElement pElement, HIDElementTypeMask typeMask) { return NULL; }
static inline long HIDGetElementValue(pRecDevice pDevice, pRecElement pElement) { return 0; }
static inline long HIDCalibrateValue(long value, pRecElement pElement) { return value; }
static inline long HIDScaleValue(long value, pRecElement pElement) { return value; }
static inline unsigned char HIDConfigureAction(pRecDevice *ppDevice, pRecElement *ppElement, float timeout) {
    if (ppDevice)  *ppDevice  = NULL;
    if (ppElement) *ppElement = NULL;
    return 0;
}
static inline void HIDSaveElementConfig(FILE *fileRef, pRecDevice pDevice,
                                         pRecElement pElement, long actionCookie) { }
static inline long HIDRestoreElementConfig(FILE *fileRef, pRecDevice *ppDevice,
                                            pRecElement *ppElement) { return 0; }
static inline void HIDGetTypeName(unsigned long type, char *cstrName) {
    if (cstrName) cstrName[0] = 0;
}
static inline void HIDGetUsageName(long page, long usage, char *cstrName) {
    if (cstrName) cstrName[0] = 0;
}
static inline OSErr SetupHIDCFM(void) { return 0; }
static inline void TearDownHIDCFM(void) { }

/* Queue operations */
static inline unsigned long HIDQueueElement(pRecDevice pDevice, pRecElement pElement) { return 0; }
static inline unsigned long HIDQueueDevice(pRecDevice pDevice) { return 0; }
static inline unsigned long HIDDequeueElement(pRecDevice pDevice, pRecElement pElement) { return 0; }
static inline unsigned long HIDDequeueDevice(pRecDevice pDevice) { return 0; }
static inline unsigned char HIDGetEvent(pRecDevice pDevice, void *pHIDEvent) { return 0; }

#endif /* HIDACCESS_C_INCLUDED */
