---@meta
---Public Lua API for Reckless Drivin' scripts.
---
---This file is a Lua Language Server definition file. It contains declarations
---only; the implementations live in source/scripts.c.

---@class RecklessObject
local Object = {}

---@return number
function Object:x() end
---@return number
function Object:y() end
---@param x number
---@param y number
function Object:setPosition(x, y) end
---@return number
function Object:velocityX() end
---@return number
function Object:velocityY() end
---@param x number
---@param y number
function Object:setVelocity(x, y) end
---@param x number
---@param y number
function Object:addVelocity(x, y) end
---@return number
function Object:direction() end
---@param radians number
function Object:setDirection(radians) end
---@return integer
function Object:frame() end
---@param frame integer
function Object:setFrame(frame) end
---@param ticks number
function Object:setFrameDuration(ticks) end
---@return number
function Object:damage() end
---@param value number
function Object:setDamage(value) end
---@return integer
function Object:typeId() end
---@return number
function Object:maxDamage() end
---@return integer
function Object:scoreValue() end
---@return number
function Object:mass() end
---@return number
function Object:width() end
---@return number
function Object:length() end
---@return integer
function Object:flags() end
---@return integer
function Object:flags2() end
---@return integer
function Object:control() end
---@return integer
function Object:layer() end
---@param layer integer
function Object:setLayer(layer) end
---@return boolean
function Object:isPlayer() end
---@return boolean
function Object:exists() end
---@return boolean
function Object:isOnScreen() end
---@param other RecklessObject
---@return number
function Object:distanceTo(other) end
---@param other RecklessObject
---@return number
function Object:angleTo(other) end
---@param throttle number
---@param steering number
function Object:setInput(throttle, steering) end
---@param control integer
function Object:setControl(control) end
function Object:kill() end
function Object:remove() end
---@param key string
---@return any
function Object:getState(key) end
---@param key string
---@param value any
function Object:setState(key, value) end
---@param child RecklessObject
function Object:addChild(child) end
---@param child RecklessObject
function Object:removeChild(child) end
---@return integer
function Object:childCount() end

---@class RecklessContext
local Context = {}

---@param ... any
function Context:log(...) end

---@return number
function Context:playerDistance() end
---@return number
function Context:levelTime() end
---@return integer
function Context:levelNumber() end
---@return integer
function Context:levelResourceId() end
---@return number
function Context:levelEndY() end
---@return RecklessObject?
function Context:player() end
---@return number
function Context:playerX() end
---@return number
function Context:playerY() end
---@return number
function Context:playerSpeed() end
---@return number
function Context:playerDamage() end
---@param x number
---@param y number
---@param direction number|nil
function Context:teleportPlayer(x, y, direction) end
---@param dx number
---@param dy number
---@param directionOffset number|nil
function Context:teleportPlayerRelative(dx, dy, directionOffset) end
---@param typeId integer
---@return boolean
function Context:objectTypeExists(typeId) end
---@param soundId integer
---@return boolean
function Context:soundExists(soundId) end
---@param frameId integer
---@return boolean
function Context:frameExists(frameId) end
---@param typeId integer
---@param radius number
---@return RecklessObject?
function Context:findNearestObject(typeId, radius) end
---@param typeId integer
---@param radius number
---@return integer
function Context:countObjects(typeId, radius) end
---@param name string
---@param seconds number
function Context:setTimer(name, seconds) end
---@param name string
---@return number|nil
function Context:getTimer(name) end
---@param name string
function Context:clearTimer(name) end
---@param name string
---@return number|nil
function Context:timerRemaining(name) end
---@param seconds number
---@param name string
function Context:after(seconds, name) end
---@param seconds number
---@param name string
function Context:every(seconds, name) end
---@param name string
function Context:cancelSchedule(name) end
---@param radius number
function Context:setPlayerNearRadius(radius) end
---@param typeId integer
---@param x number
---@param y number
---@param direction number
---@param speed number
---@return RecklessObject?
function Context:spawnObjectType(typeId, x, y, direction, speed) end
---@param typeId integer
---@param x number
---@param y number
---@param direction number
---@param speed number
---@return RecklessObject?
function Context:spawnAt(typeId, x, y, direction, speed) end
---@param typeId integer
---@param dx number
---@param dy number
---@param directionOffset number
---@param speed number
---@return RecklessObject?
function Context:spawnNearPlayer(typeId, dx, dy, directionOffset, speed) end
---@param typeId integer
---@param track string
---@param y number
---@param lateralOffset number
---@param speed number
---@return RecklessObject?
function Context:spawnOnTrack(typeId, track, y, lateralOffset, speed) end
---@param typeId integer
---@param roadSide string
---@param y number
---@param lateralOffset number
---@param control integer
---@param speed number
---@return RecklessObject?
function Context:spawnTrackside(typeId, roadSide, y, lateralOffset, control, speed) end
---@param typeId integer
---@param dx number
---@param dy number
---@param directionOffset number
---@param speed number
---@return RecklessObject?
function Context:spawnRelative(typeId, dx, dy, directionOffset, speed) end
---@param limit integer|nil
---@return integer
function Context:despawnChildren(limit) end
---@param soundId integer
function Context:playSound(soundId) end
---@param points integer
function Context:addScore(points) end
---@param typeId integer
function Context:fireWeapon(typeId) end
---@param key string
---@return any
function Context:getScriptState(key) end
---@param key string
---@param value any
function Context:setScriptState(key, value) end
---@param key string
---@return any
function Context:getLevelState(key) end
---@param key string
---@param value any
function Context:setLevelState(key, value) end

---@class Control
---@field None integer
---@field DriveUp integer
---@field DriveDown integer
---@field CrossRoad integer
---@field Cop integer
Control = {
  None = 0,
  DriveUp = 1,
  DriveDown = 2,
  CrossRoad = 3,
  Cop = 4,
}
---@class ObjectFlag
---@field Wheel integer
---@field SolidFriction integer
---@field BackCollision integer
---@field KilledByCars integer
---@field KillsCars integer
---@field Bounce integer
---@field Cop integer
---@field Heli integer
---@field Bonus integer
---@field Missile integer
---@field RoadKill integer
---@field Damageable integer
---@field DieWhenOutOfScreen integer
ObjectFlag = {}
---@class Addon
---@field Lock integer
---@field Cop integer
---@field Turbo integer
---@field Spikes integer
Addon = {}
---@class Track
---@field Up string
---@field Down string
Track = { Up = "up", Down = "down" }
---@class RoadSide
---@field Left string
---@field Right string
RoadSide = { Left = "left", Right = "right" }

---@param self RecklessObject
---@param ctx RecklessContext
function onSpawn(self, ctx) end
---@param self RecklessObject
---@param ctx RecklessContext
---@param dt number
function onTick(self, ctx, dt) end
---@param self RecklessObject
---@param ctx RecklessContext
---@param other RecklessObject?
---@param collision table
function onCollision(self, ctx, other, collision) end
---@param self RecklessObject
---@param ctx RecklessContext
---@param amount number
---@param source RecklessObject?
---@return boolean|number|nil
function onDamage(self, ctx, amount, source) end
---@param self RecklessObject
---@param ctx RecklessContext
function onDeath(self, ctx) end
---@param self RecklessObject
---@param ctx RecklessContext
---@param reason string
function onDespawn(self, ctx, reason) end
---@param self RecklessObject
---@param ctx RecklessContext
---@param oldScriptId integer
---@param newScriptId integer
function onScriptChanged(self, ctx, oldScriptId, newScriptId) end
---@param self RecklessObject
---@param ctx RecklessContext
---@param child RecklessObject
function onSpawnedChild(self, ctx, child) end
---@param self RecklessObject
---@param ctx RecklessContext
---@param parent RecklessObject
function onSpawnedBy(self, ctx, parent) end
---@param self RecklessObject
---@param ctx RecklessContext
---@param name string
function onSchedule(self, ctx, name) end
---@param self RecklessObject
---@param ctx RecklessContext
---@param name string
function onTimer(self, ctx, name) end
---@param self RecklessObject
---@param ctx RecklessContext
---@param distance number
function onPlayerNear(self, ctx, distance) end
---@param self RecklessObject
---@param ctx RecklessContext
---@param distance number
function onPlayerFar(self, ctx, distance) end
---@param self RecklessObject
---@param ctx RecklessContext
function onAnimationEnd(self, ctx) end
---@param self RecklessObject
---@param ctx RecklessContext
function onOffscreen(self, ctx) end
---@param self RecklessObject
---@param ctx RecklessContext
---@param player RecklessObject
function onPickup(self, ctx, player) end
---@param ctx RecklessContext
function onLevelStart(ctx) end
---@param ctx RecklessContext
---@param dt number
function onLevelTick(ctx, dt) end
---@param ctx RecklessContext
function onLevelComplete(ctx) end
---@param ctx RecklessContext
---@param player RecklessObject
function onPlayerRespawn(ctx, player) end
---@param ctx RecklessContext
---@param roll integer
function onAddOnAward(ctx, roll) end
