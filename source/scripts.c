#include "scripts.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "error.h"
#include "gamesounds.h"
#include "packs.h"
#include "vec2d.h"

#ifdef HAVE_LUA_SCRIPTING
#include <lua.h>
#include <lauxlib.h>
#include <lualib.h>
#endif

#define SCRIPT_FOURCC(a,b,c,d) (((UInt32)(a) << 24) | ((UInt32)(b) << 16) | ((UInt32)(c) << 8) | (UInt32)(d))
#define kScriptResourceType SCRIPT_FOURCC('S','c','r','p')
#define kScriptMapResourceType SCRIPT_FOURCC('S','c','M','p')
#define kScriptMapResourceID 128
#define kScriptMagic SCRIPT_FOURCC('S','C','R','P')
#define kScriptMapMagic SCRIPT_FOURCC('S','C','M','P')
#define kScriptFormatVersion 1
#define kMaxScriptBindings 512
#define kMaxScripts 256

typedef struct {
	SInt16 objectTypeId;
	SInt16 scriptId;
	UInt16 flags;
} tScriptBinding;

#ifdef HAVE_LUA_SCRIPTING
typedef struct {
	int id;
	lua_State *state;
} tLoadedScript;
#endif

static tScriptBinding gScriptBindings[kMaxScriptBindings];
static int gScriptBindingCount = 0;

#ifdef HAVE_LUA_SCRIPTING
static tLoadedScript gScripts[kMaxScripts];
static int gScriptCount = 0;
static tObject *gCurrentScriptObject = nil;
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

#ifdef HAVE_LUA_SCRIPTING
static tObject *CheckObjectArg(lua_State *L, int index)
{
	luaL_checktype(L, index, LUA_TTABLE);
	lua_getfield(L, index, "__object");
	tObject *theObj = (tObject*)lua_touserdata(L, -1);
	lua_pop(L, 1);
	if(!theObj)
		luaL_error(L, "invalid script object");
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

static int LuaSelfKill(lua_State *L)
{
	KillObject(CheckObjectArg(L, 1));
	return 0;
}

static int LuaSelfRemove(lua_State *L)
{
	tObject *theObj = CheckObjectArg(L, 1);
	theObj->scriptId = 0;
	LOG_DEBUG("LOG: [Lua] self:remove() requested; deferred removal is not implemented yet\n");
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

static int LuaCtxSpawnObjectType(lua_State *L)
{
	SInt16 typeId = (SInt16)luaL_checkinteger(L, 2);
	float x = (float)luaL_optnumber(L, 3, gCurrentScriptObject ? gCurrentScriptObject->pos.x : 0);
	float y = (float)luaL_optnumber(L, 4, gCurrentScriptObject ? gCurrentScriptObject->pos.y : 0);
	float dir = (float)luaL_optnumber(L, 5, gCurrentScriptObject ? gCurrentScriptObject->dir : 0);
	float speed = (float)luaL_optnumber(L, 6, 0);
	tObject *spawned = NewObject(gCurrentScriptObject ? gCurrentScriptObject : gFirstObj, typeId);
	if(spawned)
	{
		spawned->pos = P2D(x, y);
		spawned->dir = dir;
		spawned->velo = P2D(sin(dir) * speed, cos(dir) * speed);
	}
	return 0;
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

static void PushObjectTable(lua_State *L, tObject *theObj, int selfTable)
{
	lua_newtable(L);
	lua_pushlightuserdata(L, theObj);
	lua_setfield(L, -2, "__object");
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
		RegisterMethod(L, "damage", LuaSelfDamage);
		RegisterMethod(L, "setDamage", LuaSelfSetDamage);
		RegisterMethod(L, "typeId", LuaSelfTypeId);
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
	RegisterMethod(L, "spawnObjectType", LuaCtxSpawnObjectType);
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
	PushObjectTable(L, theObj, true);
	PushContextTable(L);
	lua_pushnumber(L, dt);
	if(lua_pcall(L, 3, 0, 0) != LUA_OK)
	{
		LOG_DEBUG("LOG: Lua script #%d %s error: %s\n", theObj->scriptId, hookName, lua_tostring(L, -1));
		lua_pop(L, 1);
	}
	gCurrentScriptObject = nil;
}
#endif

void Script_Init(void)
{
	LoadScriptMap();
#ifdef HAVE_LUA_SCRIPTING
	LoadBoundScripts();
	LOG_DEBUG("LOG: Script_Init lua=1 bindings=%d scripts=%d\n", gScriptBindingCount, gScriptCount);
#else
	LOG_DEBUG("LOG: Script_Init lua=0 bindings=%d\n", gScriptBindingCount);
#endif
}

void Script_Shutdown(void)
{
#ifdef HAVE_LUA_SCRIPTING
	for(int i = 0; i < gScriptCount; i++)
		if(gScripts[i].state)
			lua_close(gScripts[i].state);
	memset(gScripts, 0, sizeof(gScripts));
	gScriptCount = 0;
	gCurrentScriptObject = nil;
#endif
	memset(gScriptBindings, 0, sizeof(gScriptBindings));
	gScriptBindingCount = 0;
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
	CallHook(theObj, "onTick", dt);
#else
	(void)theObj;
	(void)dt;
#endif
}

void Script_OnDeath(tObject *theObj)
{
#ifdef HAVE_LUA_SCRIPTING
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
	CallHook(theObj, "onOffscreen", 0);
#else
	(void)theObj;
#endif
}
