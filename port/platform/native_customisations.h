#ifndef RD_NATIVE_CUSTOMISATIONS_H
#define RD_NATIVE_CUSTOMISATIONS_H

#include <stddef.h>

typedef struct RDCustomisations {
    int levelEnabled;
    int level;
    int hasStartY;
    int startY;
    int hasObjectGroupStartY;
    int objectGroupStartY;
    unsigned forcedAddOns;
    unsigned disabledBonusRollMask;
    char resourcePath[4096];
} RDCustomisations;

/* Returns one only when the user applies the dialog. */
int RDPlatformShowCustomisations(RDCustomisations *settings);
int RDNativeResourceCount(void);
const char *RDNativeResourceName(int index);
const char *RDNativeResourcePath(int index);
int RDNativeImportResource(const char *path, char *outPath, size_t capacity);
void RDNativeLoadCustomisations(void);
void RDNativeApplyLaunchOptions(void);
void RDNativePrepareNewGame(void);
void RDNativeShowCustomisations(void);

#endif
