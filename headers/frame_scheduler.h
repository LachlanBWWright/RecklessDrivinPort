#ifndef FRAME_SCHEDULER_H
#define FRAME_SCHEDULER_H

#include <stdint.h>

#define FRAME_SCHEDULER_HZ 60.0
#define FRAME_SCHEDULER_MAX_STEPS 8

typedef struct
{
    uint64_t previousTimeUS;
    uint64_t accumulatorUnits;
    int initialized;
} FrameScheduler;

typedef struct
{
    int simulationSteps;
    float interpolationAlpha;
    int droppedSteps;
} FrameSchedule;

void FrameScheduler_Reset(FrameScheduler *scheduler, uint64_t nowUS);
FrameSchedule FrameScheduler_Advance(FrameScheduler *scheduler, uint64_t nowUS);

#endif
