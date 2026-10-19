export interface FlagOption {
  bit: number;
  label: string;
  hint: string;
}

export type ScalarField =
  | 'frame'
  | 'numFrames'
  | 'frameDuration'
  | 'mass'
  | 'maxEngineForce'
  | 'maxNegEngineForce'
  | 'friction'
  | 'steering'
  | 'wheelWidth'
  | 'wheelLength'
  | 'width'
  | 'length'
  | 'score'
  | 'maxDamage'
  | 'weaponInfo';

export type ReferenceField = 'deathObj' | 'creationSound' | 'otherSound' | 'weaponObj';

const FLAGS = [
  ['Wheel', 'kObjectWheelFlag: enables wheel-force vehicle physics.'],
  ['Solid friction', 'kObjectSolidFrictionFlag: uses solid-surface friction path.'],
  ['Back collision', 'kObjectBackCollFlag: enables rear-collision checks.'],
  ['Random frame', 'kObjectRandomFrameFlag: spawn frame randomized in NewObject().'],
  [
    'Die when anim ends',
    'kObjectDieWhenAnimEndsFlag: remove object when animation reaches last frame.',
  ],
  ['Default death', 'kObjectDefaultDeath: use Explosion() default death path.'],
  ['Follow marks', 'kObjectFollowMarks: controller follows generated marks/track guidance.'],
  ['Overtake', 'kObjectOvertake: enables overtake target offset in AI.'],
  ['Slow', 'kObjectSlow: lowers AI target speed multiplier.'],
  ['Long', 'kObjectLong: marks long-body collision behavior.'],
  ['Killed by cars', 'kObjectKilledByCars: allows destruction from vehicle hits.'],
  ['Kills cars', 'kObjectKillsCars: object can kill colliding cars.'],
  ['Bounce', 'kObjectBounce: enables bounce response on collisions.'],
  ['Cop', 'kObjectCop: object participates in cop behavior/systems.'],
  ['Heli', 'kObjectHeliFlag: helicopter movement/control handling.'],
  ['Bonus', 'kObjectBonusFlag: object is treated as a bonus/add-on pickup.'],
] as const;

const FLAGS2 = [
  ['Add-on', 'kObjectAddOnFlag: marks object as an add-on pickup/effect.'],
  ['Front collision', 'kObjectFrontCollFlag: enables front-collision behavior.'],
  ['Oil', 'kObjectOil: marks oil-type hazard behavior.'],
  ['Missile', 'kObjectMissile: projectile logic treats object as missile.'],
  ['Road kill', 'kObjectRoadKill: road-kill movement path in object control.'],
  ['Layer 1', 'kObjectLayerFlag1: contributes to render layer bits.'],
  ['Layer 2', 'kObjectLayerFlag2: contributes to render layer bits.'],
  ['Engine sound', 'kObjectEngineSound: object uses looping engine sound logic.'],
  ['Ramp', 'kObjectRamp: object behaves as ramp-type collision surface.'],
  ['Sink', 'kObjectSink: allows sink/deathOffs behavior in water.'],
  ['Damageable', 'kObjectDamageble: object takes and tracks damage.'],
  ['Die when off-screen', 'kObjectDieWhenOutOfScreen: despawn when out of view.'],
  ['Rear drive', 'kObjectRearDrive: rear wheels receive engine force.'],
  ['Rear steer', 'kObjectRearSteer: steering applied to rear wheels.'],
  ['Floating', 'kObjectFloating: receives water drift/tide float behavior.'],
  ['Bump', 'kObjectBump: bump interaction behavior flag.'],
] as const;

function createFlags(entries: readonly (readonly [string, string])[]): FlagOption[] {
  return entries.map(([label, hint], index) => ({ bit: 1 << index, label, hint }));
}

export const FLAG_OPTIONS: Record<'flags' | 'flags2', FlagOption[]> = {
  flags: createFlags(FLAGS),
  flags2: createFlags(FLAGS2),
};

export const FIELD_TOOLTIPS: Record<ScalarField | ReferenceField, string> = {
  frame: 'tObjectType.frame: base sprite frame id (Pack 129/137).',
  numFrames: 'tObjectType.numFrames: low byte = animation frames, high byte = repeat count.',
  frameDuration: 'tObjectType.frameDuration: seconds between animation frame advances.',
  mass: 'tObjectType.mass: used in force/acceleration calculations in objectPhysics.c.',
  maxEngineForce: 'tObjectType.maxEngineForce: forward drive force cap.',
  maxNegEngineForce: 'tObjectType.maxNegEngineForce: reverse/brake drive force cap.',
  friction: 'tObjectType.friction: multiplied with road friction in wheel-force math.',
  steering: 'tObjectType.steering: steering angle influence for wheel vectors.',
  wheelWidth: 'tObjectType.wheelWidth: lateral wheel offset from center.',
  wheelLength: 'tObjectType.wheelLength: longitudinal wheel offset from center.',
  width: 'tObjectType.width: collision half-width.',
  length: 'tObjectType.length: collision half-length.',
  score: 'tObjectType.score: points awarded for this object.',
  maxDamage: 'tObjectType.maxDamage: threshold before kill path triggers.',
  weaponInfo: 'tObjectType.weaponInfo: projectile launch speed offset in FireWeapon().',
  deathObj: 'tObjectType.deathObj: replacement type on death (-1 disables replacement).',
  creationSound: 'tObjectType.creationSound: sound id played on spawn.',
  otherSound: 'tObjectType.otherSound: secondary sound id used by object logic.',
  weaponObj: 'tObjectType.weaponObj: spawned projectile/object id (0 = none).',
};
