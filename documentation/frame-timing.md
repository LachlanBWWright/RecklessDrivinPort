# Frame timing

Gameplay uses a fixed 60 Hz simulation. This preserves the original physics,
AI, animation, and script behavior, all of which were authored around
`kFrameDuration` being 1/60 second.

Platform loops call `GameLoopTick()` whenever they receive an opportunity to
present a frame. The frame scheduler accumulates monotonic wall-clock time and
runs `GameFrame()` zero or more times in fixed increments. Rendering happens
once after those updates, independently of the display refresh rate. A 120 Hz
browser therefore alternates between presentation-only ticks and simulation
ticks instead of advancing gameplay twice as fast.

The renderer interpolates object position, direction, jump height, camera
position, and camera zoom between the two most recent simulation states.
Direction interpolation follows the shortest arc across the angle wrap.
Newly-created objects render at their current state until they have two valid
simulation snapshots.

Catch-up work is limited to eight simulation steps per presentation. Wall-clock
gaps are clamped to 250 ms, and excess whole steps are discarded. This prevents
a suspended browser tab, debugger break, or overloaded device from entering an
unbounded catch-up loop. Returning from blocking pause/fade flows resets the
scheduler so time spent outside gameplay is never simulated.
