#include "scripts.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "error.h"
#include "gameinitexit.h"
#include "gamesounds.h"
#include "packs.h"
#include "roads.h"
#include "vec2d.h"

#ifdef HAVE_LUA_SCRIPTING
#include <lua.h>
#include <lauxlib.h>
#include <lualib.h>
#endif

#define SCRIPT_FOURCC(a,b,c,d) (((UInt32)(a) << 24) | ((UInt32)(b) << 16) | ((UInt32)(c) << 8) | (UInt32)(d))
#define kScriptResourceType SCRIPT_FOURCC('S','c','r','p')
#define kScriptMapResourceType SCRIPT_FOURCC('S','c','M','p')
#define kLevelScriptMapResourceType SCRIPT_FOURCC('S','c','L','v')
#define kScriptMapResourceID 128
#define kScriptMagic SCRIPT_FOURCC('S','C','R','P')
#define kScriptMapMagic SCRIPT_FOURCC('S','C','M','P')
#define kLevelScriptMapMagic SCRIPT_FOURCC('S','C','L','V')
#define kScriptFormatVersion 1
#define kMaxScriptBindings 512
#define kMaxLevelScriptBindings 128
#define kMaxScripts 256
#define kMaxScriptSpawnsPerHook 8
#define kMaxScriptTimers 1024
#define kMaxScriptProximityWatchers 512
#define kMaxScriptTimerName 32

typedef struct {
	SInt16 objectTypeId;
	SInt16 scriptId;
	UInt16 flags;
} tScriptBinding;

typedef struct {
	UInt16 levelResourceId;
	UInt16 scriptId;
	UInt16 flags;
} tLevelScriptBinding;

#ifdef HAVE_LUA_SCRIPTING
typedef struct {
	int id;
	lua_State *state;
} tLoadedScript;

typedef struct {
	tObject *object;
	int scriptId;
	char name[kMaxScriptTimerName];
	float remaining;
	int active;
} tScriptTimer;

typedef struct {
	tObject *object;
	int scriptId;
	float radius;
	int wasNear;
	int active;
} tScriptProximityWatcher;
#endif

static tScriptBinding gScriptBindings[kMaxScriptBindings];
static int gScriptBindingCount = 0;
static tLevelScriptBinding gLevelScriptBindings[kMaxLevelScriptBindings];
static int gLevelScriptBindingCount = 0;
static int gGlobalLevelScriptId = 0;
static int gCurrentLevelScriptId = 0;

#ifdef HAVE_LUA_SCRIPTING
static tLoadedScript gScripts[kMaxScripts];
static int gScriptCount = 0;
static tObject *gCurrentScriptObject = nil;
static int gScriptSpawnCount = 0;
static tScriptTimer gScriptTimers[kMaxScriptTimers];
static tScriptProximityWatcher gScriptProximityWatchers[kMaxScriptProximityWatchers];
static void PushObjectTable(lua_State *L, tObject *theObj, int selfTable);
#endif

static UInt16 ReadBE16(const UInt8 *data)
{
	return (UInt16)(((UInt16)data[0] << 8) | data[1]);
}

static UInt32 ReadBE32(const UInt8 *data)
{
	return ((UInt32)data[0] << 24) | ((UInt32)data[1] << 16) | ((UInt32)data[2] << 8) | data[3];
}

static int FindScriptIdForType(SInt16 typeRes)
{
	for(int i = 0; i < gScriptBindingCount; i++)
		if(gScriptBindings[i].objectTypeId == typeRes)
			return gScriptBindings[i].scriptId;
	return 0;
}

static int FindScriptIdForLevel(UInt16 levelResourceId)
{
	for(int i = 0; i < gLevelScriptBindingCount; i++)
		if(gLevelScriptBindings[i].levelResourceId == levelResourceId)
			return gLevelScriptBindings[i].scriptId;
	return 0;
}

void Script_SetObjectScript(tObject *theObj, SInt16 typeRes)
{
	if(theObj)
	{
		theObj->scriptId = FindScriptIdForType(typeRes);
		theObj->objectTypeId = typeRes;
	}
}

static void LoadScriptMap(void)
{
	gScriptBindingCount = 0;
	Handle map = Get1Resource(kScriptMapResourceType, kScriptMapResourceID);
	if(!map)
		return;
	Size size = GetHandleSize(map);
	UInt8 *data = (UInt8*)*map;
	if(size < 8 || ReadBE32(data) != kScriptMapMagic || ReadBE16(data + 4) != kScriptFormatVersion)
	{
		LOG_DEBUG("LOG: Lua script binding map is invalid\n");
		ReleaseResource(map);
		return;
	}
	UInt16 count = ReadBE16(data + 6);
	if(8 + (Size)count * 8 > size)
		count = (UInt16)((size - 8) / 8);
	if(count > kMaxScriptBindings)
		count = kMaxScriptBindings;
	for(UInt16 i = 0; i < count; i++)
	{
		UInt8 *entry = data + 8 + i * 8;
		gScriptBindings[gScriptBindingCount].objectTypeId = (SInt16)ReadBE16(entry);
		gScriptBindings[gScriptBindingCount].scriptId = (SInt16)ReadBE16(entry + 2);
		gScriptBindings[gScriptBindingCount].flags = ReadBE16(entry + 4);
		gScriptBindingCount++;
	}
	ReleaseResource(map);
}

static void LoadLevelScriptMap(void)
{
	gLevelScriptBindingCount = 0;
	Handle map = Get1Resource(kLevelScriptMapResourceType, kScriptMapResourceID);
	if(!map)
		return;
	Size size = GetHandleSize(map);
	UInt8 *data = (UInt8*)*map;
	if(size < 8 || ReadBE32(data) != kLevelScriptMapMagic || ReadBE16(data + 4) != kScriptFormatVersion)
	{
		LOG_DEBUG("LOG: Lua level script binding map is invalid\n");
		ReleaseResource(map);
		return;
	}
	UInt16 count = ReadBE16(data + 6);
	if(8 + (Size)count * 8 > size)
		count = (UInt16)((size - 8) / 8);
	if(count > kMaxLevelScriptBindings)
		count = kMaxLevelScriptBindings;
	for(UInt16 i = 0; i < count; i++)
	{
		UInt8 *entry = data + 8 + i * 8;
		gLevelScriptBindings[gLevelScriptBindingCount].levelResourceId = ReadBE16(entry);
		gLevelScriptBindings[gLevelScriptBindingCount].scriptId = ReadBE16(entry + 2);
		gLevelScriptBindings[gLevelScriptBindingCount].flags = ReadBE16(entry + 4);
		gLevelScriptBindingCount++;
	}
	ReleaseResource(map);
}

#ifdef HAVE_LUA_SCRIPTING
static tObject *CheckObjectArg(lua_State *L, int index)
{
	luaL_checktype(L, index, LUA_TTABLE);
	lua_getfield(L, index, "__object");
	tObject *theObj = (tObject*)lua_touserdata(L, -1);
	lua_pop(L, 1);
	lua_getfield(L, index, "__objectId");
	int objectId = (int)lua_tointeger(L, -1);
	lua_pop(L, 1);
	if(!theObj)
		luaL_error(L, "invalid script object");
	if(!ObjectIsLive(theObj) || theObj->scriptObjectId != objectId)
		luaL_error(L, "stale script object");
	return theObj;
}

static int LuaLog(lua_State *L)
{
	int argc = lua_gettop(L);
	LOG_DEBUG("LOG: [Lua]");
	for(int i = 1; i <= argc; i++)
	{
		size_t len = 0;
		const char *text = luaL_tolstring(L, i, &len);
		LOG_DEBUG(" %.*s", (int)len, text ? text : "");
		lua_pop(L, 1);
	}
	LOG_DEBUG("\n");
	return 0;
}

static int LuaSelfX(lua_State *L) { lua_pushnumber(L, CheckObjectArg(L, 1)->pos.x); return 1; }
static int LuaSelfY(lua_State *L) { lua_pushnumber(L, CheckObjectArg(L, 1)->pos.y); return 1; }
static int LuaSelfVelocityX(lua_State *L) { lua_pushnumber(L, CheckObjectArg(L, 1)->velo.x); return 1; }
static int LuaSelfVelocityY(lua_State *L) { lua_pushnumber(L, CheckObjectArg(L, 1)->velo.y); return 1; }
static int LuaSelfDirection(lua_State *L) { lua_pushnumber(L, CheckObjectArg(L, 1)->dir); return 1; }
static int LuaSelfFrame(lua_State *L) { lua_pushinteger(L, CheckObjectArg(L, 1)->frame); return 1; }
static int LuaSelfDamage(lua_State *L) { lua_pushnumber(L, CheckObjectArg(L, 1)->damage); return 1; }
static int LuaSelfTypeId(lua_State *L) { lua_pushinteger(L, CheckObjectArg(L, 1)->objectTypeId); return 1; }
static int LuaSelfMaxDamage(lua_State *L) { lua_pushnumber(L, CheckObjectArg(L, 1)->type->maxDamage); return 1; }
static int LuaSelfScoreValue(lua_State *L) { lua_pushinteger(L, CheckObjectArg(L, 1)->type->score); return 1; }
static int LuaSelfMass(lua_State *L) { lua_pushnumber(L, CheckObjectArg(L, 1)->type->mass); return 1; }
static int LuaSelfWidth(lua_State *L) { lua_pushnumber(L, CheckObjectArg(L, 1)->type->width); return 1; }
static int LuaSelfLength(lua_State *L) { lua_pushnumber(L, CheckObjectArg(L, 1)->type->length); return 1; }
static int LuaSelfFlags(lua_State *L) { lua_pushinteger(L, CheckObjectArg(L, 1)->type->flags); return 1; }
static int LuaSelfFlags2(lua_State *L) { lua_pushinteger(L, CheckObjectArg(L, 1)->type->flags2); return 1; }
static int LuaSelfControl(lua_State *L) { lua_pushinteger(L, CheckObjectArg(L, 1)->control); return 1; }
static int LuaSelfLayer(lua_State *L) { lua_pushinteger(L, CheckObjectArg(L, 1)->layer); return 1; }
static int LuaSelfIsPlayer(lua_State *L) { lua_pushboolean(L, CheckObjectArg(L, 1) == gPlayerObj); return 1; }
static int LuaSelfExists(lua_State *L)
{
	luaL_checktype(L, 1, LUA_TTABLE);
	lua_getfield(L, 1, "__object");
	tObject *theObj = (tObject*)lua_touserdata(L, -1);
	lua_pop(L, 1);
	lua_getfield(L, 1, "__objectId");
	int objectId = (int)lua_tointeger(L, -1);
	lua_pop(L, 1);
	lua_pushboolean(L, theObj && ObjectIsLive(theObj) && theObj->scriptObjectId == objectId);
	return 1;
}
static int LuaSelfIsOnScreen(lua_State *L)
{
	tObject *theObj = CheckObjectArg(L, 1);
	lua_pushboolean(L, gCameraObj && fabs(theObj->pos.y - gCameraObj->pos.y) < kVisDist);
	return 1;
}

static int LuaSelfDistanceTo(lua_State *L)
{
	tObject *theObj = CheckObjectArg(L, 1);
	tObject *otherObj = CheckObjectArg(L, 2);
	lua_pushnumber(L, VEC2D_Value(VEC2D_Difference(theObj->pos, otherObj->pos)));
	return 1;
}

static int LuaSelfAngleTo(lua_State *L)
{
	tObject *theObj = CheckObjectArg(L, 1);
	tObject *otherObj = CheckObjectArg(L, 2);
	t2DPoint diff = VEC2D_Difference(otherObj->pos, theObj->pos);
	lua_pushnumber(L, atan2(diff.x, diff.y));
	return 1;
}

static int LuaSelfSetPosition(lua_State *L)
{
	tObject *theObj = CheckObjectArg(L, 1);
	theObj->pos.x = (float)luaL_checknumber(L, 2);
	theObj->pos.y = (float)luaL_checknumber(L, 3);
	return 0;
}

static int LuaSelfSetVelocity(lua_State *L)
{
	tObject *theObj = CheckObjectArg(L, 1);
	theObj->velo.x = (float)luaL_checknumber(L, 2);
	theObj->velo.y = (float)luaL_checknumber(L, 3);
	return 0;
}

static int LuaSelfAddVelocity(lua_State *L)
{
	tObject *theObj = CheckObjectArg(L, 1);
	theObj->velo.x += (float)luaL_checknumber(L, 2);
	theObj->velo.y += (float)luaL_checknumber(L, 3);
	return 0;
}

static int LuaSelfSetDirection(lua_State *L)
{
	CheckObjectArg(L, 1)->dir = (float)luaL_checknumber(L, 2);
	return 0;
}

static int LuaSelfSetFrame(lua_State *L)
{
	CheckObjectArg(L, 1)->frame = (int)luaL_checkinteger(L, 2);
	return 0;
}

static int LuaSelfSetDamage(lua_State *L)
{
	CheckObjectArg(L, 1)->damage = (float)luaL_checknumber(L, 2);
	return 0;
}

static int LuaSelfSetInput(lua_State *L)
{
	tObject *theObj = CheckObjectArg(L, 1);
	theObj->input.throttle = (float)luaL_checknumber(L, 2);
	theObj->input.steering = (float)luaL_checknumber(L, 3);
	return 0;
}

static int LuaSelfSetControl(lua_State *L)
{
	CheckObjectArg(L, 1)->control = (int)luaL_checkinteger(L, 2);
	return 0;
}

static int LuaSelfSetLayer(lua_State *L)
{
	int layer = (int)luaL_checkinteger(L, 2);
	if(layer < kGroundLayer)
		layer = kGroundLayer;
	if(layer >= kNumLayers)
		layer = kNumLayers - 1;
	CheckObjectArg(L, 1)->layer = layer;
	return 0;
}

static int LuaSelfSetFrameDuration(lua_State *L)
{
	CheckObjectArg(L, 1)->frameDuration = (float)luaL_checknumber(L, 2);
	return 0;
}

static int LuaSelfKill(lua_State *L)
{
	KillObject(CheckObjectArg(L, 1));
	return 0;
}

static int LuaSelfRemove(lua_State *L)
{
	tObject *theObj = CheckObjectArg(L, 1);
	theObj->scriptRemoveRequested = true;
	return 0;
}

static int LuaCtxPlayerDistance(lua_State *L)
{
	(void)L;
	tObject *theObj = gCurrentScriptObject;
	if(!theObj || !gPlayerObj)
		lua_pushnumber(L, 0);
	else
		lua_pushnumber(L, VEC2D_Value(VEC2D_Difference(theObj->pos, gPlayerObj->pos)));
	return 1;
}

static int LuaCtxLevelTime(lua_State *L)
{
	lua_pushnumber(L, gGameTime);
	return 1;
}

static tObject *SpawnScriptObject(SInt16 typeId, t2DPoint pos, float dir, float speed)
{
	if(gScriptSpawnCount >= kMaxScriptSpawnsPerHook)
		return nil;
	tObject *spawned = NewObject(gCurrentScriptObject ? gCurrentScriptObject : gFirstObj, typeId);
	if(spawned)
	{
		gScriptSpawnCount++;
		spawned->pos = pos;
		spawned->dir = dir;
		spawned->velo = P2D(sin(dir) * speed, cos(dir) * speed);
	}
	return spawned;
}

static int PushSpawnResult(lua_State *L, tObject *spawned)
{
	if(spawned)
	{
		PushObjectTable(L, spawned, true);
		return 1;
	}
	lua_pushnil(L);
	return 1;
}

static tScriptTimer *FindScriptTimer(tObject *theObj, const char *name)
{
	for(int i = 0; i < kMaxScriptTimers; i++)
		if(gScriptTimers[i].active && gScriptTimers[i].object == theObj && strncmp(gScriptTimers[i].name, name, kMaxScriptTimerName) == 0)
			return &gScriptTimers[i];
	return nil;
}

static tScriptTimer *FindOrCreateScriptTimer(tObject *theObj, const char *name)
{
	tScriptTimer *timer = FindScriptTimer(theObj, name);
	if(timer)
		return timer;
	for(int i = 0; i < kMaxScriptTimers; i++)
	{
		if(!gScriptTimers[i].active)
		{
			memset(&gScriptTimers[i], 0, sizeof(gScriptTimers[i]));
			gScriptTimers[i].object = theObj;
			gScriptTimers[i].scriptId = theObj ? theObj->scriptId : 0;
			strncpy(gScriptTimers[i].name, name, kMaxScriptTimerName - 1);
			gScriptTimers[i].active = true;
			return &gScriptTimers[i];
		}
	}
	return nil;
}

static void ClearObjectScriptTimers(tObject *theObj)
{
	for(int i = 0; i < kMaxScriptTimers; i++)
		if(gScriptTimers[i].object == theObj)
			memset(&gScriptTimers[i], 0, sizeof(gScriptTimers[i]));
}

static tScriptProximityWatcher *FindOrCreateProximityWatcher(tObject *theObj)
{
	for(int i = 0; i < kMaxScriptProximityWatchers; i++)
		if(gScriptProximityWatchers[i].active && gScriptProximityWatchers[i].object == theObj)
			return &gScriptProximityWatchers[i];
	for(int i = 0; i < kMaxScriptProximityWatchers; i++)
	{
		if(!gScriptProximityWatchers[i].active)
		{
			memset(&gScriptProximityWatchers[i], 0, sizeof(gScriptProximityWatchers[i]));
			gScriptProximityWatchers[i].object = theObj;
			gScriptProximityWatchers[i].scriptId = theObj ? theObj->scriptId : 0;
			gScriptProximityWatchers[i].active = true;
			return &gScriptProximityWatchers[i];
		}
	}
	return nil;
}

static void ClearObjectProximityWatcher(tObject *theObj)
{
	for(int i = 0; i < kMaxScriptProximityWatchers; i++)
		if(gScriptProximityWatchers[i].object == theObj)
			memset(&gScriptProximityWatchers[i], 0, sizeof(gScriptProximityWatchers[i]));
}

static int LuaCtxSetTimer(lua_State *L)
{
	if(!gCurrentScriptObject)
		return 0;
	const char *name = luaL_checkstring(L, 2);
	float seconds = (float)luaL_checknumber(L, 3);
	if(seconds < 0)
		seconds = 0;
	tScriptTimer *timer = FindOrCreateScriptTimer(gCurrentScriptObject, name);
	if(timer)
		timer->remaining = seconds;
	return 0;
}

static int LuaCtxGetTimer(lua_State *L)
{
	if(!gCurrentScriptObject)
	{
		lua_pushnil(L);
		return 1;
	}
	const char *name = luaL_checkstring(L, 2);
	tScriptTimer *timer = FindScriptTimer(gCurrentScriptObject, name);
	if(!timer)
		lua_pushnil(L);
	else
		lua_pushnumber(L, timer->remaining);
	return 1;
}

static int LuaCtxClearTimer(lua_State *L)
{
	if(!gCurrentScriptObject)
		return 0;
	const char *name = luaL_checkstring(L, 2);
	tScriptTimer *timer = FindScriptTimer(gCurrentScriptObject, name);
	if(timer)
		memset(timer, 0, sizeof(*timer));
	return 0;
}

static int LuaCtxTimerRemaining(lua_State *L)
{
	return LuaCtxGetTimer(L);
}

static int LuaCtxSetPlayerNearRadius(lua_State *L)
{
	if(!gCurrentScriptObject)
		return 0;
	float radius = (float)luaL_checknumber(L, 2);
	if(radius <= 0)
	{
		ClearObjectProximityWatcher(gCurrentScriptObject);
		return 0;
	}
	tScriptProximityWatcher *watcher = FindOrCreateProximityWatcher(gCurrentScriptObject);
	if(watcher)
	{
		watcher->radius = radius;
		watcher->wasNear = gPlayerObj && VEC2D_Value(VEC2D_Difference(gCurrentScriptObject->pos, gPlayerObj->pos)) <= radius;
	}
	return 0;
}

static int LuaCtxLevelNumber(lua_State *L)
{
	lua_pushinteger(L, gLevelID + 1);
	return 1;
}

static int LuaCtxLevelResourceId(lua_State *L)
{
	lua_pushinteger(L, kPackLevel1 + gLevelID);
	return 1;
}

static int LuaCtxLevelEndY(lua_State *L)
{
	lua_pushnumber(L, gLevelData ? gLevelData->levelEnd : 0);
	return 1;
}

static int LuaCtxPlayer(lua_State *L)
{
	if(gPlayerObj)
		PushObjectTable(L, gPlayerObj, true);
	else
		lua_pushnil(L);
	return 1;
}

static int LuaCtxPlayerX(lua_State *L)
{
	lua_pushnumber(L, gPlayerObj ? gPlayerObj->pos.x : 0);
	return 1;
}

static int LuaCtxPlayerY(lua_State *L)
{
	lua_pushnumber(L, gPlayerObj ? gPlayerObj->pos.y : 0);
	return 1;
}

static int LuaCtxPlayerSpeed(lua_State *L)
{
	lua_pushnumber(L, gPlayerObj ? VEC2D_Value(gPlayerObj->velo) : 0);
	return 1;
}

static int LuaCtxPlayerDamage(lua_State *L)
{
	lua_pushnumber(L, gPlayerObj ? gPlayerObj->damage : 0);
	return 1;
}

static int LuaCtxObjectTypeExists(lua_State *L)
{
	SInt16 typeId = (SInt16)luaL_checkinteger(L, 2);
	lua_pushboolean(L, GetUnsortedPackEntry(kPackObTy, typeId, nil) != nil);
	return 1;
}

static int LuaCtxSoundExists(lua_State *L)
{
	SInt16 soundId = (SInt16)luaL_checkinteger(L, 2);
	lua_pushboolean(L, GetUnsortedPackEntry(kPackSnds, soundId, nil) != nil);
	return 1;
}

static int LuaCtxFrameExists(lua_State *L)
{
	SInt16 frameId = (SInt16)luaL_checkinteger(L, 2);
	lua_pushboolean(L, GetUnsortedPackEntry(kPackSprt, frameId, nil) != nil || GetUnsortedPackEntry(kPackSp16, frameId, nil) != nil);
	return 1;
}

static int ObjectMatchesType(tObject *theObj, int typeId)
{
	return typeId <= 0 || theObj->objectTypeId == typeId;
}

static int LuaCtxFindNearestObject(lua_State *L)
{
	int typeId = (int)luaL_optinteger(L, 2, 0);
	float radius = (float)luaL_optnumber(L, 3, kVisDist);
	tObject *origin = gCurrentScriptObject ? gCurrentScriptObject : gPlayerObj;
	tObject *bestObj = nil;
	float bestDistance = radius;
	if(origin && gFirstObj)
	{
		tObject *theObj = (tObject*)gFirstObj->next;
		while(theObj != gFirstObj)
		{
			if(theObj != origin && ObjectMatchesType(theObj, typeId))
			{
				float distance = VEC2D_Value(VEC2D_Difference(theObj->pos, origin->pos));
				if(distance <= bestDistance)
				{
					bestDistance = distance;
					bestObj = theObj;
				}
			}
			theObj = (tObject*)theObj->next;
		}
	}
	if(bestObj)
		PushObjectTable(L, bestObj, true);
	else
		lua_pushnil(L);
	return 1;
}

static int LuaCtxCountObjects(lua_State *L)
{
	int typeId = (int)luaL_optinteger(L, 2, 0);
	float radius = (float)luaL_optnumber(L, 3, kVisDist);
	tObject *origin = gCurrentScriptObject ? gCurrentScriptObject : gPlayerObj;
	int count = 0;
	if(origin && gFirstObj)
	{
		tObject *theObj = (tObject*)gFirstObj->next;
		while(theObj != gFirstObj)
		{
			if(theObj != origin && ObjectMatchesType(theObj, typeId))
			{
				float distance = VEC2D_Value(VEC2D_Difference(theObj->pos, origin->pos));
				if(distance <= radius)
					count++;
			}
			theObj = (tObject*)theObj->next;
		}
	}
	lua_pushinteger(L, count);
	return 1;
}

static int LuaCtxSpawnObjectType(lua_State *L)
{
	SInt16 typeId = (SInt16)luaL_checkinteger(L, 2);
	float x = (float)luaL_optnumber(L, 3, gCurrentScriptObject ? gCurrentScriptObject->pos.x : 0);
	float y = (float)luaL_optnumber(L, 4, gCurrentScriptObject ? gCurrentScriptObject->pos.y : 0);
	float dir = (float)luaL_optnumber(L, 5, gCurrentScriptObject ? gCurrentScriptObject->dir : 0);
	float speed = (float)luaL_optnumber(L, 6, 0);
	return PushSpawnResult(L, SpawnScriptObject(typeId, P2D(x, y), dir, speed));
}

static int LuaCtxSpawnRelative(lua_State *L)
{
	if(!gCurrentScriptObject)
	{
		lua_pushnil(L);
		return 1;
	}
	SInt16 typeId = (SInt16)luaL_checkinteger(L, 2);
	float dx = (float)luaL_optnumber(L, 3, 0);
	float dy = (float)luaL_optnumber(L, 4, 0);
	float dirOffset = (float)luaL_optnumber(L, 5, 0);
	float speed = (float)luaL_optnumber(L, 6, 0);
	float sinDir = sin(gCurrentScriptObject->dir);
	float cosDir = cos(gCurrentScriptObject->dir);
	float x = gCurrentScriptObject->pos.x + cosDir * dx + sinDir * dy;
	float y = gCurrentScriptObject->pos.y - sinDir * dx + cosDir * dy;
	return PushSpawnResult(L, SpawnScriptObject(typeId, P2D(x, y), gCurrentScriptObject->dir + dirOffset, speed));
}

static int LuaCtxPlaySound(lua_State *L)
{
	int soundId = (int)luaL_checkinteger(L, 2);
	if(gCurrentScriptObject)
		PlaySound(gCurrentScriptObject->pos, gCurrentScriptObject->velo, 1.0, 1.0, soundId);
	else
		SimplePlaySound(soundId);
	return 0;
}

static int LuaCtxAddScore(lua_State *L)
{
	gPlayerScore += (int)luaL_checkinteger(L, 2);
	return 0;
}

static int LuaCtxFireWeapon(lua_State *L)
{
	if(gCurrentScriptObject)
		FireWeapon(gCurrentScriptObject, (int)luaL_checkinteger(L, 2));
	return 0;
}

static void RegisterMethod(lua_State *L, const char *name, lua_CFunction fn)
{
	lua_pushcfunction(L, fn);
	lua_setfield(L, -2, name);
}

static void SetTableInteger(lua_State *L, const char *name, int value)
{
	lua_pushinteger(L, value);
	lua_setfield(L, -2, name);
}

static void RegisterConstants(lua_State *L)
{
	lua_newtable(L);
	SetTableInteger(L, "None", kObjectNoInput);
	SetTableInteger(L, "DriveUp", kObjectDriveUp);
	SetTableInteger(L, "DriveDown", kObjectDriveDown);
	SetTableInteger(L, "CrossRoad", kObjectCrossRoad);
	SetTableInteger(L, "Cop", kObjectCopControl);
	lua_setglobal(L, "Control");

	lua_newtable(L);
	SetTableInteger(L, "Wheel", kObjectWheelFlag);
	SetTableInteger(L, "SolidFriction", kObjectSolidFrictionFlag);
	SetTableInteger(L, "BackCollision", kObjectBackCollFlag);
	SetTableInteger(L, "KilledByCars", kObjectKilledByCars);
	SetTableInteger(L, "KillsCars", kObjectKillsCars);
	SetTableInteger(L, "Bounce", kObjectBounce);
	SetTableInteger(L, "Cop", kObjectCop);
	SetTableInteger(L, "Heli", kObjectHeliFlag);
	SetTableInteger(L, "Bonus", kObjectBonusFlag);
	SetTableInteger(L, "Missile", kObjectMissile);
	SetTableInteger(L, "RoadKill", kObjectRoadKill);
	SetTableInteger(L, "Damageable", kObjectDamageble);
	SetTableInteger(L, "DieWhenOutOfScreen", kObjectDieWhenOutOfScreen);
	lua_setglobal(L, "ObjectFlag");

	lua_newtable(L);
	SetTableInteger(L, "Lock", kAddOnLock);
	SetTableInteger(L, "Cop", kAddOnCop);
	SetTableInteger(L, "Turbo", kAddOnTurbo);
	SetTableInteger(L, "Spikes", kAddOnSpikes);
	lua_setglobal(L, "Addon");
}

static void PushObjectTable(lua_State *L, tObject *theObj, int selfTable)
{
	lua_newtable(L);
	lua_pushlightuserdata(L, theObj);
	lua_setfield(L, -2, "__object");
	lua_pushinteger(L, theObj ? theObj->scriptObjectId : 0);
	lua_setfield(L, -2, "__objectId");
	if(selfTable)
	{
		RegisterMethod(L, "x", LuaSelfX);
		RegisterMethod(L, "y", LuaSelfY);
		RegisterMethod(L, "setPosition", LuaSelfSetPosition);
		RegisterMethod(L, "velocityX", LuaSelfVelocityX);
		RegisterMethod(L, "velocityY", LuaSelfVelocityY);
		RegisterMethod(L, "setVelocity", LuaSelfSetVelocity);
		RegisterMethod(L, "addVelocity", LuaSelfAddVelocity);
		RegisterMethod(L, "direction", LuaSelfDirection);
		RegisterMethod(L, "setDirection", LuaSelfSetDirection);
		RegisterMethod(L, "frame", LuaSelfFrame);
		RegisterMethod(L, "setFrame", LuaSelfSetFrame);
		RegisterMethod(L, "setFrameDuration", LuaSelfSetFrameDuration);
		RegisterMethod(L, "damage", LuaSelfDamage);
		RegisterMethod(L, "setDamage", LuaSelfSetDamage);
		RegisterMethod(L, "typeId", LuaSelfTypeId);
		RegisterMethod(L, "maxDamage", LuaSelfMaxDamage);
		RegisterMethod(L, "scoreValue", LuaSelfScoreValue);
		RegisterMethod(L, "mass", LuaSelfMass);
		RegisterMethod(L, "width", LuaSelfWidth);
		RegisterMethod(L, "length", LuaSelfLength);
		RegisterMethod(L, "flags", LuaSelfFlags);
		RegisterMethod(L, "flags2", LuaSelfFlags2);
		RegisterMethod(L, "control", LuaSelfControl);
		RegisterMethod(L, "layer", LuaSelfLayer);
		RegisterMethod(L, "setLayer", LuaSelfSetLayer);
		RegisterMethod(L, "isPlayer", LuaSelfIsPlayer);
		RegisterMethod(L, "exists", LuaSelfExists);
		RegisterMethod(L, "isOnScreen", LuaSelfIsOnScreen);
		RegisterMethod(L, "distanceTo", LuaSelfDistanceTo);
		RegisterMethod(L, "angleTo", LuaSelfAngleTo);
		RegisterMethod(L, "setInput", LuaSelfSetInput);
		RegisterMethod(L, "setControl", LuaSelfSetControl);
		RegisterMethod(L, "kill", LuaSelfKill);
		RegisterMethod(L, "remove", LuaSelfRemove);
	}
}

static void PushContextTable(lua_State *L)
{
	lua_newtable(L);
	RegisterMethod(L, "log", LuaLog);
	RegisterMethod(L, "playerDistance", LuaCtxPlayerDistance);
	RegisterMethod(L, "levelTime", LuaCtxLevelTime);
	RegisterMethod(L, "levelNumber", LuaCtxLevelNumber);
	RegisterMethod(L, "levelResourceId", LuaCtxLevelResourceId);
	RegisterMethod(L, "levelEndY", LuaCtxLevelEndY);
	RegisterMethod(L, "player", LuaCtxPlayer);
	RegisterMethod(L, "playerX", LuaCtxPlayerX);
	RegisterMethod(L, "playerY", LuaCtxPlayerY);
	RegisterMethod(L, "playerSpeed", LuaCtxPlayerSpeed);
	RegisterMethod(L, "playerDamage", LuaCtxPlayerDamage);
	RegisterMethod(L, "objectTypeExists", LuaCtxObjectTypeExists);
	RegisterMethod(L, "soundExists", LuaCtxSoundExists);
	RegisterMethod(L, "frameExists", LuaCtxFrameExists);
	RegisterMethod(L, "findNearestObject", LuaCtxFindNearestObject);
	RegisterMethod(L, "countObjects", LuaCtxCountObjects);
	RegisterMethod(L, "setTimer", LuaCtxSetTimer);
	RegisterMethod(L, "getTimer", LuaCtxGetTimer);
	RegisterMethod(L, "clearTimer", LuaCtxClearTimer);
	RegisterMethod(L, "timerRemaining", LuaCtxTimerRemaining);
	RegisterMethod(L, "setPlayerNearRadius", LuaCtxSetPlayerNearRadius);
	RegisterMethod(L, "spawnObjectType", LuaCtxSpawnObjectType);
	RegisterMethod(L, "spawnRelative", LuaCtxSpawnRelative);
	RegisterMethod(L, "playSound", LuaCtxPlaySound);
	RegisterMethod(L, "addScore", LuaCtxAddScore);
	RegisterMethod(L, "fireWeapon", LuaCtxFireWeapon);
}

static lua_State *CreateScriptState(void)
{
	lua_State *L = luaL_newstate();
	if(!L)
		return nil;
	luaL_openlibs(L);
	lua_pushnil(L); lua_setglobal(L, "io");
	lua_pushnil(L); lua_setglobal(L, "os");
	lua_pushnil(L); lua_setglobal(L, "debug");
	lua_pushnil(L); lua_setglobal(L, "package");
	lua_pushnil(L); lua_setglobal(L, "require");
	lua_pushnil(L); lua_setglobal(L, "dofile");
	lua_pushnil(L); lua_setglobal(L, "loadfile");
	lua_pushnil(L); lua_setglobal(L, "load");
	lua_pushcfunction(L, LuaLog); lua_setglobal(L, "log");
	lua_pushcfunction(L, LuaLog); lua_setglobal(L, "print");
	RegisterConstants(L);
	return L;
}

static tLoadedScript *FindLoadedScript(int scriptId)
{
	for(int i = 0; i < gScriptCount; i++)
		if(gScripts[i].id == scriptId)
			return &gScripts[i];
	return nil;
}

static int LoadScriptResource(int scriptId)
{
	if(FindLoadedScript(scriptId) || gScriptCount >= kMaxScripts)
		return 0;
	Handle resource = Get1Resource(kScriptResourceType, (short)scriptId);
	if(!resource)
	{
		LOG_DEBUG("LOG: Lua script #%d resource missing\n", scriptId);
		return -1;
	}
	Size size = GetHandleSize(resource);
	UInt8 *data = (UInt8*)*resource;
	if(size < 16 || ReadBE32(data) != kScriptMagic || ReadBE16(data + 4) != kScriptFormatVersion)
	{
		LOG_DEBUG("LOG: Lua script #%d resource is invalid\n", scriptId);
		ReleaseResource(resource);
		return -1;
	}
	UInt16 nameLength = ReadBE16(data + 8);
	UInt32 sourceLength = ReadBE32(data + 12);
	Size sourceOffset = 16 + nameLength;
	if(sourceOffset + (Size)sourceLength > size)
	{
		LOG_DEBUG("LOG: Lua script #%d payload overruns resource\n", scriptId);
		ReleaseResource(resource);
		return -1;
	}
	lua_State *L = CreateScriptState();
	if(!L)
	{
		ReleaseResource(resource);
		return -1;
	}
	char chunkName[48];
	snprintf(chunkName, sizeof(chunkName), "Scrp #%d", scriptId);
	if(luaL_loadbuffer(L, (const char*)data + sourceOffset, sourceLength, chunkName) != LUA_OK || lua_pcall(L, 0, 0, 0) != LUA_OK)
	{
		LOG_DEBUG("LOG: Lua script #%d load error: %s\n", scriptId, lua_tostring(L, -1));
		lua_close(L);
		ReleaseResource(resource);
		return -1;
	}
	gScripts[gScriptCount].id = scriptId;
	gScripts[gScriptCount].state = L;
	gScriptCount++;
	LOG_DEBUG("LOG: Loaded Lua script #%d\n", scriptId);
	ReleaseResource(resource);
	return 0;
}

static void LoadBoundScripts(void)
{
	for(int i = 0; i < gScriptBindingCount; i++)
		LoadScriptResource(gScriptBindings[i].scriptId);
	for(int i = 0; i < gLevelScriptBindingCount; i++)
		LoadScriptResource(gLevelScriptBindings[i].scriptId);
}

static void CallLevelHookForScript(int scriptId, const char *hookName, float dt)
{
	if(!scriptId)
		return;
	tLoadedScript *script = FindLoadedScript(scriptId);
	if(!script || !script->state)
		return;
	lua_State *L = script->state;
	lua_getglobal(L, hookName);
	if(!lua_isfunction(L, -1))
	{
		lua_pop(L, 1);
		return;
	}
	gCurrentScriptObject = nil;
	gScriptSpawnCount = 0;
	PushContextTable(L);
	if(strcmp(hookName, "onLevelTick") == 0)
	{
		lua_pushnumber(L, dt);
		if(lua_pcall(L, 2, 0, 0) != LUA_OK)
		{
			LOG_DEBUG("LOG: Lua script #%d %s error: %s\n", scriptId, hookName, lua_tostring(L, -1));
			lua_pop(L, 1);
		}
	}
	else
	{
		if(lua_pcall(L, 1, 0, 0) != LUA_OK)
		{
			LOG_DEBUG("LOG: Lua script #%d %s error: %s\n", scriptId, hookName, lua_tostring(L, -1));
			lua_pop(L, 1);
		}
	}
	gCurrentScriptObject = nil;
	gScriptSpawnCount = 0;
}

static void CallLevelHook(const char *hookName, float dt)
{
	CallLevelHookForScript(gGlobalLevelScriptId, hookName, dt);
	if(gCurrentLevelScriptId && gCurrentLevelScriptId != gGlobalLevelScriptId)
		CallLevelHookForScript(gCurrentLevelScriptId, hookName, dt);
}

static void CallHook(tObject *theObj, const char *hookName, float dt)
{
	if(!theObj || !theObj->scriptId)
		return;
	tLoadedScript *script = FindLoadedScript(theObj->scriptId);
	if(!script || !script->state)
		return;
	lua_State *L = script->state;
	lua_getglobal(L, hookName);
	if(!lua_isfunction(L, -1))
	{
		lua_pop(L, 1);
		return;
	}
	gCurrentScriptObject = theObj;
	gScriptSpawnCount = 0;
	PushObjectTable(L, theObj, true);
	PushContextTable(L);
	lua_pushnumber(L, dt);
	if(lua_pcall(L, 3, 0, 0) != LUA_OK)
	{
		LOG_DEBUG("LOG: Lua script #%d %s error: %s\n", theObj->scriptId, hookName, lua_tostring(L, -1));
		lua_pop(L, 1);
	}
	gCurrentScriptObject = nil;
	gScriptSpawnCount = 0;
}

static void CallCollisionHook(tObject *theObj, tObject *otherObj)
{
	if(!theObj || !theObj->scriptId)
		return;
	tLoadedScript *script = FindLoadedScript(theObj->scriptId);
	if(!script || !script->state)
		return;
	lua_State *L = script->state;
	lua_getglobal(L, "onCollision");
	if(!lua_isfunction(L, -1))
	{
		lua_pop(L, 1);
		return;
	}
	gCurrentScriptObject = theObj;
	gScriptSpawnCount = 0;
	PushObjectTable(L, theObj, true);
	PushContextTable(L);
	if(otherObj)
		PushObjectTable(L, otherObj, true);
	else
		lua_pushnil(L);
	lua_newtable(L);
	lua_pushstring(L, "object");
	lua_setfield(L, -2, "kind");
	if(lua_pcall(L, 4, 0, 0) != LUA_OK)
	{
		LOG_DEBUG("LOG: Lua script #%d onCollision error: %s\n", theObj->scriptId, lua_tostring(L, -1));
		lua_pop(L, 1);
	}
	gCurrentScriptObject = nil;
	gScriptSpawnCount = 0;
}

static float CallDamageHook(tObject *theObj, float amount, tObject *sourceObj)
{
	if(!theObj || !theObj->scriptId)
		return amount;
	tLoadedScript *script = FindLoadedScript(theObj->scriptId);
	if(!script || !script->state)
		return amount;
	lua_State *L = script->state;
	lua_getglobal(L, "onDamage");
	if(!lua_isfunction(L, -1))
	{
		lua_pop(L, 1);
		return amount;
	}
	gCurrentScriptObject = theObj;
	gScriptSpawnCount = 0;
	PushObjectTable(L, theObj, true);
	PushContextTable(L);
	lua_pushnumber(L, amount);
	if(sourceObj)
		PushObjectTable(L, sourceObj, true);
	else
		lua_pushnil(L);
	if(lua_pcall(L, 4, 1, 0) != LUA_OK)
	{
		LOG_DEBUG("LOG: Lua script #%d onDamage error: %s\n", theObj->scriptId, lua_tostring(L, -1));
		lua_pop(L, 1);
		gCurrentScriptObject = nil;
		gScriptSpawnCount = 0;
		return amount;
	}
	if(lua_isboolean(L, -1) && !lua_toboolean(L, -1))
		amount = 0;
	else if(lua_isnumber(L, -1))
		amount = (float)lua_tonumber(L, -1);
	lua_pop(L, 1);
	gCurrentScriptObject = nil;
	gScriptSpawnCount = 0;
	return amount;
}

static void CallTimerHook(tObject *theObj, const char *name)
{
	if(!theObj || !theObj->scriptId)
		return;
	tLoadedScript *script = FindLoadedScript(theObj->scriptId);
	if(!script || !script->state)
		return;
	lua_State *L = script->state;
	lua_getglobal(L, "onTimer");
	if(!lua_isfunction(L, -1))
	{
		lua_pop(L, 1);
		return;
	}
	gCurrentScriptObject = theObj;
	gScriptSpawnCount = 0;
	PushObjectTable(L, theObj, true);
	PushContextTable(L);
	lua_pushstring(L, name);
	if(lua_pcall(L, 3, 0, 0) != LUA_OK)
	{
		LOG_DEBUG("LOG: Lua script #%d onTimer error: %s\n", theObj->scriptId, lua_tostring(L, -1));
		lua_pop(L, 1);
	}
	gCurrentScriptObject = nil;
	gScriptSpawnCount = 0;
}

static void CallPlayerProximityHook(tObject *theObj, const char *hookName, float distance)
{
	if(!theObj || !theObj->scriptId)
		return;
	tLoadedScript *script = FindLoadedScript(theObj->scriptId);
	if(!script || !script->state)
		return;
	lua_State *L = script->state;
	lua_getglobal(L, hookName);
	if(!lua_isfunction(L, -1))
	{
		lua_pop(L, 1);
		return;
	}
	gCurrentScriptObject = theObj;
	gScriptSpawnCount = 0;
	PushObjectTable(L, theObj, true);
	PushContextTable(L);
	lua_pushnumber(L, distance);
	if(lua_pcall(L, 3, 0, 0) != LUA_OK)
	{
		LOG_DEBUG("LOG: Lua script #%d %s error: %s\n", theObj->scriptId, hookName, lua_tostring(L, -1));
		lua_pop(L, 1);
	}
	gCurrentScriptObject = nil;
	gScriptSpawnCount = 0;
}

static void UpdateObjectScriptTimers(tObject *theObj, float dt)
{
	for(int i = 0; i < kMaxScriptTimers; i++)
	{
		tScriptTimer *timer = &gScriptTimers[i];
		if(!timer->active || timer->object != theObj)
			continue;
		timer->remaining -= dt;
		if(timer->remaining <= 0)
		{
			char name[kMaxScriptTimerName];
			strncpy(name, timer->name, sizeof(name));
			name[sizeof(name) - 1] = '\0';
			memset(timer, 0, sizeof(*timer));
			CallTimerHook(theObj, name);
		}
	}
}

static void UpdateObjectProximityWatcher(tObject *theObj)
{
	if(!gPlayerObj)
		return;
	for(int i = 0; i < kMaxScriptProximityWatchers; i++)
	{
		tScriptProximityWatcher *watcher = &gScriptProximityWatchers[i];
		if(!watcher->active || watcher->object != theObj)
			continue;
		float distance = VEC2D_Value(VEC2D_Difference(theObj->pos, gPlayerObj->pos));
		int isNear = distance <= watcher->radius;
		if(isNear && !watcher->wasNear)
			CallPlayerProximityHook(theObj, "onPlayerNear", distance);
		else if(!isNear && watcher->wasNear)
			CallPlayerProximityHook(theObj, "onPlayerFar", distance);
		watcher->wasNear = isNear;
	}
}
#endif

void Script_Init(void)
{
	LoadScriptMap();
	LoadLevelScriptMap();
#ifdef HAVE_LUA_SCRIPTING
	LoadBoundScripts();
	LOG_DEBUG("LOG: Script_Init lua=1 bindings=%d levelBindings=%d scripts=%d\n", gScriptBindingCount, gLevelScriptBindingCount, gScriptCount);
#else
	LOG_DEBUG("LOG: Script_Init lua=0 bindings=%d levelBindings=%d\n", gScriptBindingCount, gLevelScriptBindingCount);
#endif
}

void Script_Shutdown(void)
{
#ifdef HAVE_LUA_SCRIPTING
	for(int i = 0; i < gScriptCount; i++)
		if(gScripts[i].state)
			lua_close(gScripts[i].state);
	memset(gScripts, 0, sizeof(gScripts));
	memset(gScriptTimers, 0, sizeof(gScriptTimers));
	memset(gScriptProximityWatchers, 0, sizeof(gScriptProximityWatchers));
	gScriptCount = 0;
	gCurrentScriptObject = nil;
#endif
	memset(gScriptBindings, 0, sizeof(gScriptBindings));
	gScriptBindingCount = 0;
	memset(gLevelScriptBindings, 0, sizeof(gLevelScriptBindings));
	gLevelScriptBindingCount = 0;
	gGlobalLevelScriptId = 0;
	gCurrentLevelScriptId = 0;
}

void Script_SetCurrentLevel(SInt16 levelResourceId)
{
	gGlobalLevelScriptId = FindScriptIdForLevel(0);
	gCurrentLevelScriptId = FindScriptIdForLevel((UInt16)levelResourceId);
}

void Script_ClearCurrentLevel(void)
{
	gGlobalLevelScriptId = 0;
	gCurrentLevelScriptId = 0;
}

void Script_OnLevelStart(void)
{
#ifdef HAVE_LUA_SCRIPTING
	CallLevelHook("onLevelStart", 0);
#endif
}

void Script_OnLevelTick(float dt)
{
#ifdef HAVE_LUA_SCRIPTING
	CallLevelHook("onLevelTick", dt);
#else
	(void)dt;
#endif
}

void Script_OnSpawn(tObject *theObj)
{
#ifdef HAVE_LUA_SCRIPTING
	CallHook(theObj, "onSpawn", 0);
#else
	(void)theObj;
#endif
}

void Script_OnTick(tObject *theObj, float dt)
{
#ifdef HAVE_LUA_SCRIPTING
	UpdateObjectScriptTimers(theObj, dt);
	UpdateObjectProximityWatcher(theObj);
	CallHook(theObj, "onTick", dt);
#else
	(void)theObj;
	(void)dt;
#endif
}

void Script_OnCollision(tObject *theObj, tObject *otherObj)
{
#ifdef HAVE_LUA_SCRIPTING
	CallCollisionHook(theObj, otherObj);
#else
	(void)theObj;
	(void)otherObj;
#endif
}

float Script_OnDamage(tObject *theObj, float amount, tObject *sourceObj)
{
#ifdef HAVE_LUA_SCRIPTING
	return CallDamageHook(theObj, amount, sourceObj);
#else
	(void)theObj;
	(void)sourceObj;
	return amount;
#endif
}

void Script_OnDeath(tObject *theObj)
{
#ifdef HAVE_LUA_SCRIPTING
	ClearObjectScriptTimers(theObj);
	ClearObjectProximityWatcher(theObj);
	CallHook(theObj, "onDeath", 0);
#else
	(void)theObj;
#endif
}

void Script_OnAnimationEnd(tObject *theObj)
{
#ifdef HAVE_LUA_SCRIPTING
	CallHook(theObj, "onAnimationEnd", 0);
#else
	(void)theObj;
#endif
}

void Script_OnOffscreen(tObject *theObj)
{
#ifdef HAVE_LUA_SCRIPTING
	ClearObjectScriptTimers(theObj);
	ClearObjectProximityWatcher(theObj);
	CallHook(theObj, "onOffscreen", 0);
#else
	(void)theObj;
#endif
}

int Script_DrainDeferredRemoval(tObject *theObj)
{
	if(!theObj || !ObjectIsLive(theObj) || !theObj->scriptRemoveRequested)
		return false;
	theObj->scriptRemoveRequested = false;
#ifdef HAVE_LUA_SCRIPTING
	ClearObjectScriptTimers(theObj);
	ClearObjectProximityWatcher(theObj);
#endif
	RemoveObject(theObj);
	return true;
}
