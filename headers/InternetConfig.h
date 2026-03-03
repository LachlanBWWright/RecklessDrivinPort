/* InternetConfig.h - Apple Internet Config stub */
#pragma once
#include "mac_compat.h"

typedef void *ICInstance;

static inline OSErr ICStart(ICInstance *inst, OSType creator) {
    if (inst) *inst = NULL;
    return 0;
}
static inline OSErr ICStop(ICInstance inst) { return 0; }
static inline OSErr ICLaunchURL(ICInstance inst, const char *hint,
                                 const char *data, long len,
                                 long *selStart, long *selEnd) {
    return 0;
}
