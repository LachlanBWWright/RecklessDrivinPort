#include "frame_scheduler.h"

#define MICROSECONDS_PER_SECOND 1000000ULL
#define MAX_ELAPSED_US 250000ULL

void FrameScheduler_Reset(FrameScheduler *scheduler, uint64_t nowUS)
{
    scheduler->previousTimeUS = nowUS;
    scheduler->accumulatorUnits = 0;
    scheduler->initialized = 1;
}

FrameSchedule FrameScheduler_Advance(FrameScheduler *scheduler, uint64_t nowUS)
{
    FrameSchedule schedule = {0, 0.0f, 0};
    uint64_t elapsedUS;
    int availableSteps;

    if (!scheduler->initialized)
    {
        FrameScheduler_Reset(scheduler, nowUS);
        return schedule;
    }

    if (nowUS < scheduler->previousTimeUS)
        elapsedUS = 0;
    else
        elapsedUS = nowUS - scheduler->previousTimeUS;
    scheduler->previousTimeUS = nowUS;

    if (elapsedUS > MAX_ELAPSED_US)
        elapsedUS = MAX_ELAPSED_US;
    scheduler->accumulatorUnits += elapsedUS * (uint64_t)FRAME_SCHEDULER_HZ;

    availableSteps = (int)(scheduler->accumulatorUnits / MICROSECONDS_PER_SECOND);
    schedule.simulationSteps = availableSteps;
    if (schedule.simulationSteps > FRAME_SCHEDULER_MAX_STEPS)
    {
        schedule.droppedSteps = schedule.simulationSteps - FRAME_SCHEDULER_MAX_STEPS;
        schedule.simulationSteps = FRAME_SCHEDULER_MAX_STEPS;
    }

    /* Consume dropped time too. A stalled tab must not create a catch-up spiral. */
    scheduler->accumulatorUnits -= (uint64_t)availableSteps * MICROSECONDS_PER_SECOND;
    schedule.interpolationAlpha = (float)scheduler->accumulatorUnits / (float)MICROSECONDS_PER_SECOND;
    return schedule;
}
