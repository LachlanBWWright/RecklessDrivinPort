/* iShockXForceAPI.h - iShock force feedback API stub */
#pragma once
#include "mac_compat.h"

#define iS2F_MAX_ISHOCK2_NUM 4

typedef void *iS2F_DeviceRef_t;

typedef struct {
    float leftMotorMagnitude;
    float rightMotorMagnitude;
} iS2F_MotorCmd_t;

typedef struct {
    iS2F_MotorCmd_t motorCmd;
    float duration;
} iS2F_JoltCmd_t;

/* input.c calls iS2F_Init() with no arguments */
static inline int iS2F_Init(void) { return 0; } /* returns 0 = no devices */
static inline OSErr iS2F_Final(void) { return 0; }
static inline OSErr iS2F_GetDevRefList(iS2F_DeviceRef_t *devList) { return 0; }
static inline OSErr iS2F_SimpleJolt(iS2F_DeviceRef_t dev, iS2F_JoltCmd_t *cmd) { return 0; }
static inline OSErr iS2F_SimpleDirectControl(iS2F_DeviceRef_t dev, iS2F_MotorCmd_t *cmd) { return 0; }
