/**
 * Static data and type constants for the object-types section component.
 */

export interface FlagOption {
  bit: number;
  label: string;
  hint: string;
}

export type ScalarField =
  | 'frame' | 'numFrames' | 'frameDuration' | 'mass' | 'maxEngineForce'
  | 'maxNegEngineForce' | 'friction' | 'steering' | 'wheelWidth' | 'wheelLength'
  | 'width' | 'length' | 'score' | 'maxDamage' | 'weaponInfo';

export type ReferenceField = 'deathObj' | 'creationSound' | 'otherSound' | 'weaponObj';

export const SCALAR_FIELDS: ScalarField[] = [
  'frame', 'numFrames', 'frameDuration', 'mass', 'maxEngineForce',
  'maxNegEngineForce', 'friction', 'steering', 'wheelWidth', 'wheelLength',
  'width', 'length', 'score', 'maxDamage', 'weaponInfo',
];

export const REFERENCE_FIELDS: ReferenceField[] = ['deathObj', 'creationSound', 'otherSound', 'weaponObj'];

export const FLAG_OPTIONS: Record<'flags' | 'flags2', FlagOption[]> = {
  flags: [
    { bit: 1 << 0,  label: 'Wheel',            hint: 'Uses wheel physics' },
    { bit: 1 << 1,  label: 'Solid friction',    hint: 'Applies solid-surface friction' },
    { bit: 1 << 2,  label: 'Back collision',    hint: 'Uses back-collision handling' },
    { bit: 1 << 3,  label: 'Random frame',      hint: 'Starts on a random animation frame' },
    { bit: 1 << 4,  label: 'Die when anim ends',hint: 'Kills the object at the end of animation' },
    { bit: 1 << 5,  label: 'Default death',     hint: 'Spawns the default explosion on death' },
    { bit: 1 << 6,  label: 'Follow marks',      hint: 'Uses mark-following behavior' },
    { bit: 1 << 7,  label: 'Overtake',          hint: 'Allows overtaking behavior' },
    { bit: 1 << 8,  label: 'Slow',              hint: 'Marked as slow-moving' },
    { bit: 1 << 9,  label: 'Long',              hint: 'Marked as long' },
    { bit: 1 << 10, label: 'Killed by cars',    hint: 'Can be destroyed by cars' },
    { bit: 1 << 11, label: 'Kills cars',        hint: 'Can destroy cars on contact' },
    { bit: 1 << 12, label: 'Bounce',            hint: 'Bouncy collision response' },
    { bit: 1 << 13, label: 'Cop',               hint: 'Uses cop control logic' },
    { bit: 1 << 14, label: 'Heli',              hint: 'Helicopter-style movement' },
    { bit: 1 << 15, label: 'Bonus',             hint: 'Counts as a bonus object' },
  ],
  flags2: [
    { bit: 1 << 0,  label: 'Add-on',            hint: 'Treat as an add-on object' },
    { bit: 1 << 1,  label: 'Front collision',   hint: 'Uses front collision handling' },
    { bit: 1 << 2,  label: 'Oil',               hint: 'Drops oil' },
    { bit: 1 << 3,  label: 'Missile',           hint: 'Behaves like a missile' },
    { bit: 1 << 4,  label: 'Road kill',         hint: 'Uses road-kill movement' },
    { bit: 1 << 5,  label: 'Layer 1',           hint: 'Draw on layer 1' },
    { bit: 1 << 6,  label: 'Layer 2',           hint: 'Draw on layer 2' },
    { bit: 1 << 7,  label: 'Engine sound',      hint: 'Route sound through engine playback' },
    { bit: 1 << 8,  label: 'Ramp',              hint: 'Ramp behavior' },
    { bit: 1 << 9,  label: 'Sink',              hint: 'Can sink in water' },
    { bit: 1 << 10, label: 'Damageable',        hint: 'Tracks and applies damage' },
    { bit: 1 << 11, label: 'Die when off-screen', hint: 'Remove when off-screen' },
    { bit: 1 << 12, label: 'Rear drive',        hint: 'Drive from rear wheels' },
    { bit: 1 << 13, label: 'Rear steer',        hint: 'Steer from rear wheels' },
    { bit: 1 << 14, label: 'Floating',          hint: 'Float in water' },
    { bit: 1 << 15, label: 'Bump',              hint: 'Bump behavior' },
  ],
};
