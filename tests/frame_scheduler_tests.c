#include <assert.h>
#include <math.h>
#include <stdio.h>
#include "frame_scheduler.h"

static void TestRefreshRateDoesNotChangeSimulationRate(int refreshRate)
{
    FrameScheduler scheduler = {0};
    int totalSteps = 0;
    int frame;

    FrameScheduler_Reset(&scheduler, 0);
    for (frame = 1; frame <= refreshRate; frame++)
    {
        uint64_t nowUS = (uint64_t)llround((double)frame * 1000000.0 / refreshRate);
        FrameSchedule schedule = FrameScheduler_Advance(&scheduler, nowUS);
        totalSteps += schedule.simulationSteps;
        assert(schedule.droppedSteps == 0);
        assert(schedule.interpolationAlpha >= 0.0f);
        assert(schedule.interpolationAlpha < 1.0f);
    }
    assert(totalSteps == 60);
}

static void TestCatchUpIsBounded(void)
{
    FrameScheduler scheduler = {0};
    FrameSchedule schedule;

    FrameScheduler_Reset(&scheduler, 1000000);
    schedule = FrameScheduler_Advance(&scheduler, 2000000);
    assert(schedule.simulationSteps == FRAME_SCHEDULER_MAX_STEPS);
    assert(schedule.droppedSteps == 7);
    assert(schedule.interpolationAlpha >= 0.0f);
    assert(schedule.interpolationAlpha < 1.0f);
}

static void TestResetDiscardsPausedTime(void)
{
    FrameScheduler scheduler = {0};
    FrameSchedule schedule;

    FrameScheduler_Reset(&scheduler, 0);
    FrameScheduler_Advance(&scheduler, 10000);
    FrameScheduler_Reset(&scheduler, 5000000);
    schedule = FrameScheduler_Advance(&scheduler, 5005000);
    assert(schedule.simulationSteps == 0);
    assert(fabsf(schedule.interpolationAlpha - 0.3f) < 0.0001f);
}

int main(void)
{
    TestRefreshRateDoesNotChangeSimulationRate(30);
    TestRefreshRateDoesNotChangeSimulationRate(60);
    TestRefreshRateDoesNotChangeSimulationRate(120);
    TestRefreshRateDoesNotChangeSimulationRate(144);
    TestCatchUpIsBounded();
    TestResetDiscardsPausedTime();
    puts("frame scheduler tests passed");
    return 0;
}
