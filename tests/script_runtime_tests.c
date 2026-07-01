#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <math.h>

#include "scripts.h"
#include "objects.h"
#include "roads.h"
#include "gameinitexit.h"
#include "packs.h"
#include "trig.h"

#undef sin
#undef cos
#include <math.h>

#define kScriptResourceType 0x53637270      // 'Scrp'
#define kScriptMapResourceType 0x53634d70   // 'ScMp'
#define kLevelScriptMapResourceType 0x53634c76 // 'ScLv'

// Define external globals
tObject *gFirstObj = NULL;
tObject *gCameraObj = NULL;
tObject *gPlayerObj = NULL;
tObject *gSpikeObj = NULL;
tObject *gBrakeObj = NULL;
tObject *gFirstVisObj = NULL;
tObject *gLastVisObj = NULL;
tObject *gHeliObj = NULL;

int gPlayerScore = 0;
int gDisplayScore = 0;
int gLevelID = 0;
tLevelData *gLevelData = NULL;
tTrackInfo *gTrackUp = NULL;
tTrackInfo *gTrackDown = NULL;
tRoad gRoadData = NULL;
UInt32 *gRoadLenght = NULL;
tMarkSeg *gMarks = NULL;
int gMarkSize = 0;
int gScreenBlitSpecial = false;
float gGameTime = 0.0f;

// Trig lookup table population
float gSinTab[kSinTabSize];

void InitTrigTable(void)
{
	for (int i = 0; i < kSinTabSize; i++) {
		float angle = (float)i * 2.0 * PI / (float)kSinTabSize;
		gSinTab[i] = sin(angle);
	}
}

// Mock external functions
void PlaySound(t2DPoint pos, t2DPoint velo, float vol, float pitch, int soundId) {}
void SimplePlaySound(int soundId) {}
void FireWeapon(tObject *shooter, int weaponID) {}
void HandleError(int id) {}

void KillObject(tObject *obj)
{
	if (!obj) return;
	obj->scriptRemoveRequested = true;
}

Ptr GetUnsortedPackEntry(int packId, int entryId, int *sizeOut)
{
	if (packId == kPackObTy && entryId >= 100 && entryId < 300) {
		if (sizeOut) *sizeOut = 100;
		return (Ptr)1;
	}
	if (packId == kPackSnds && entryId >= 128 && entryId < 200) {
		if (sizeOut) *sizeOut = 100;
		return (Ptr)1;
	}
	if ((packId == kPackSprt || packId == kPackSp16) && entryId >= 300 && entryId < 400) {
		if (sizeOut) *sizeOut = 100;
		return (Ptr)1;
	}
	return NULL;
}

#ifdef HAVE_LUA_SCRIPTING
#include <lua.h>
#include <lauxlib.h>
#include <lualib.h>

extern lua_State *Test_GetScriptState(int scriptId);
extern int Test_GetScriptCount(void);
extern int Test_GetBindingCount(void);
extern int Test_GetLevelBindingCount(void);
extern tObject *Test_GetCurrentScriptObject(void);
extern int Test_GetSpawnCount(void);
extern void Test_SetSpawnCount(int count);
extern int Test_GetActiveTimerCount(void);
extern int Test_GetActiveWatcherCount(void);
#endif

// Resource manager mocks
typedef struct {
	UInt32 type;
	SInt16 id;
	void *data;
	Size size;
} FakeResource;

#define MAX_FAKE_RESOURCES 64
static FakeResource gFakeResources[MAX_FAKE_RESOURCES];
static int gFakeResourceCount = 0;

void AddFakeResource(UInt32 type, SInt16 id, const void *data, Size size)
{
	if (gFakeResourceCount >= MAX_FAKE_RESOURCES) return;
	gFakeResources[gFakeResourceCount].type = type;
	gFakeResources[gFakeResourceCount].id = id;
	gFakeResources[gFakeResourceCount].size = size;
	gFakeResources[gFakeResourceCount].data = malloc(size);
	memcpy(gFakeResources[gFakeResourceCount].data, data, size);
	gFakeResourceCount++;
}

void ClearFakeResources(void)
{
	for (int i = 0; i < gFakeResourceCount; i++) {
		free(gFakeResources[i].data);
	}
	gFakeResourceCount = 0;
}

Handle Get1Resource(UInt32 type, SInt16 id)
{
	for (int i = 0; i < gFakeResourceCount; i++) {
		if (gFakeResources[i].type == type && gFakeResources[i].id == id) {
			void **handle = malloc(sizeof(void*));
			*handle = gFakeResources[i].data;
			return (Handle)handle;
		}
	}
	return NULL;
}

Size GetHandleSize(Handle h)
{
	if (!h) return 0;
	void *data = *h;
	for (int i = 0; i < gFakeResourceCount; i++) {
		if (gFakeResources[i].data == data) {
			return gFakeResources[i].size;
		}
	}
	return 0;
}

void ReleaseResource(Handle h)
{
	if (h) {
		free(h);
	}
}

// Byte writing helpers
static void WriteBE16(UInt8 *dest, UInt16 val)
{
	dest[0] = (val >> 8) & 0xFF;
	dest[1] = val & 0xFF;
}

static void WriteBE32(UInt8 *dest, UInt32 val)
{
	dest[0] = (val >> 24) & 0xFF;
	dest[1] = (val >> 16) & 0xFF;
	dest[2] = (val >> 8) & 0xFF;
	dest[3] = val & 0xFF;
}

UInt8* CreateScrpPayload(const char *name, const char *source, Size *outSize)
{
	UInt16 nameLen = strlen(name);
	UInt32 sourceLen = strlen(source);
	*outSize = 16 + nameLen + sourceLen;
	UInt8 *buf = malloc(*outSize);
	WriteBE32(buf, 0x53435250); // SCRP
	WriteBE16(buf + 4, 1);      // Version
	WriteBE16(buf + 6, 0);      // Reserved
	WriteBE16(buf + 8, nameLen);
	WriteBE16(buf + 10, 0);     // Reserved
	WriteBE32(buf + 12, sourceLen);
	memcpy(buf + 16, name, nameLen);
	memcpy(buf + 16 + nameLen, source, sourceLen);
	return buf;
}

UInt8* CreateScMpPayload(int count, SInt16 *objectTypeIds, SInt16 *scriptIds, UInt16 *flags, Size *outSize)
{
	*outSize = 8 + count * 8;
	UInt8 *buf = malloc(*outSize);
	WriteBE32(buf, 0x53434d50); // SCMP
	WriteBE16(buf + 4, 1);      // Version
	WriteBE16(buf + 6, count);
	for (int i = 0; i < count; i++) {
		UInt8 *entry = buf + 8 + i * 8;
		WriteBE16(entry, objectTypeIds[i]);
		WriteBE16(entry + 2, scriptIds[i]);
		WriteBE16(entry + 4, flags ? flags[i] : 0);
		WriteBE16(entry + 6, 0);
	}
	return buf;
}

UInt8* CreateScLvPayload(int count, UInt16 *levelResourceIds, UInt16 *scriptIds, UInt16 *flags, Size *outSize)
{
	*outSize = 8 + count * 8;
	UInt8 *buf = malloc(*outSize);
	WriteBE32(buf, 0x53434c56); // SCLV
	WriteBE16(buf + 4, 1);      // Version
	WriteBE16(buf + 6, count);
	for (int i = 0; i < count; i++) {
		UInt8 *entry = buf + 8 + i * 8;
		WriteBE16(entry, levelResourceIds[i]);
		WriteBE16(entry + 2, scriptIds[i]);
		WriteBE16(entry + 4, flags ? flags[i] : 0);
		WriteBE16(entry + 6, 0);
	}
	return buf;
}

// Object manager mocks
tObject *Mock_InitObjectList(void)
{
	if (gFirstObj) {
		tObject *curr = (tObject *)gFirstObj->next;
		while (curr != gFirstObj) {
			tObject *next = (tObject *)curr->next;
			if (curr->type) free(curr->type);
			free(curr);
			curr = next;
		}
		if (gFirstObj->type) free(gFirstObj->type);
		free(gFirstObj);
	}
	gFirstObj = malloc(sizeof(tObject));
	memset(gFirstObj, 0, sizeof(tObject));
	gFirstObj->next = gFirstObj;
	gFirstObj->prev = gFirstObj;
	gFirstObj->scriptObjectId = 0;
	return gFirstObj;
}

tObject *NewObject(tObject *parent, SInt16 typeId)
{
	tObject *obj = malloc(sizeof(tObject));
	memset(obj, 0, sizeof(tObject));
	obj->objectTypeId = typeId;
	obj->type = malloc(sizeof(tObjectType));
	memset(obj->type, 0, sizeof(tObjectType));
	
	static int nextObjectId = 1000;
	obj->scriptObjectId = nextObjectId++;
	
	if (gFirstObj) {
		tObject *prev = (tObject *)gFirstObj->prev;
		prev->next = obj;
		obj->prev = prev;
		obj->next = gFirstObj;
		gFirstObj->prev = obj;
	}
	return obj;
}

int ObjectIsLive(tObject *theObj)
{
	if (!theObj || !gFirstObj) return false;
	tObject *scanObj = gFirstObj;
	do {
		if (scanObj == theObj) return true;
		scanObj = (tObject *)scanObj->next;
	} while (scanObj && scanObj != gFirstObj);
	return false;
}

void RemoveObject(tObject *obj)
{
	if (!obj) return;
	// Remove from list
	tObject *prev = (tObject *)obj->prev;
	tObject *next = (tObject *)obj->next;
	if (prev) prev->next = next;
	if (next) next->prev = prev;
	
	if (obj->type) free(obj->type);
	free(obj);
}

// Setup helper
static void SetupBindingsAndScripts(
	int bindingCount, SInt16 *objectTypeIds, SInt16 *scriptIds,
	int scriptCount, int *resourceScriptIds, const char **scriptSources
)
{
	Script_Shutdown();
	ClearFakeResources();
	
	Size mapSize;
	UInt8 *mapPayload = CreateScMpPayload(bindingCount, objectTypeIds, scriptIds, NULL, &mapSize);
	AddFakeResource(kScriptMapResourceType, 128, mapPayload, mapSize);
	free(mapPayload);
	
	for (int i = 0; i < scriptCount; i++) {
		Size scrpSize;
		char name[32];
		snprintf(name, sizeof(name), "Script %d", resourceScriptIds[i]);
		UInt8 *scrpPayload = CreateScrpPayload(name, scriptSources[i], &scrpSize);
		AddFakeResource(kScriptResourceType, resourceScriptIds[i], scrpPayload, scrpSize);
		free(scrpPayload);
	}
	
	Script_Init();
}

#undef kScriptResourceType
#undef kScriptMapResourceType
#undef kLevelScriptMapResourceType
#include "../source/scripts.c"

lua_State *Test_GetScriptState(int scriptId)
{
	for (int i = 0; i < gScriptCount; i++)
		if (gScripts[i].id == scriptId)
			return gScripts[i].state;
	return nil;
}
int Test_GetScriptCount(void) { return gScriptCount; }
int Test_GetBindingCount(void) { return gScriptBindingCount; }
int Test_GetLevelBindingCount(void) { return gLevelScriptBindingCount; }
tObject *Test_GetCurrentScriptObject(void) { return gCurrentScriptObject; }
int Test_GetSpawnCount(void) { return gScriptSpawnCount; }
void Test_SetSpawnCount(int count) { gScriptSpawnCount = count; }
int Test_GetActiveTimerCount(void)
{
	int count = 0;
	for (int i = 0; i < kMaxScriptTimers; i++)
		if (gScriptTimers[i].active)
			count++;
	return count;
}
int Test_GetActiveWatcherCount(void)
{
	int count = 0;
	for (int i = 0; i < kMaxScriptProximityWatchers; i++)
		if (gScriptProximityWatchers[i].active)
			count++;
	return count;
}

static int GetLuaGlobalInt(lua_State *L, const char *name)
{
	lua_getglobal(L, name);
	int val;
	if (lua_isboolean(L, -1))
		val = lua_toboolean(L, -1);
	else
		val = (int)lua_tointeger(L, -1);
	lua_pop(L, 1);
	return val;
}

// -------------------------------------------------------------
// TESTS
// -------------------------------------------------------------

void test_ParserAndBindingLoad(void)
{
	printf("Running test_ParserAndBindingLoad...\n");
	SInt16 objectTypeIds[] = { 200, 201 };
	SInt16 scriptIds[] = { 101, 102 };
	int resourceScriptIds[] = { 101, 102 };
	const char *sources[] = {
		"x = 1",
		"y = 2"
	};
	SetupBindingsAndScripts(2, objectTypeIds, scriptIds, 2, resourceScriptIds, sources);
	
	assert(Test_GetBindingCount() == 2);
	assert(Test_GetScriptCount() == 2);
	
	lua_State *L1 = Test_GetScriptState(101);
	lua_State *L2 = Test_GetScriptState(102);
	assert(L1 != NULL);
	assert(L2 != NULL);
	assert(GetLuaGlobalInt(L1, "x") == 1);
	assert(GetLuaGlobalInt(L2, "y") == 2);
	printf("  -> Passed!\n");
}

void test_HookDispatch(void)
{
	printf("Running test_HookDispatch...\n");
	SInt16 objectTypeIds[] = { 200 };
	SInt16 scriptIds[] = { 101 };
	int resourceScriptIds[] = { 101 };
	const char *sources[] = {
		"spawned = 0\n"
		"ticked = 0\n"
		"collided = 0\n"
		"damaged = 0\n"
		"dead = 0\n"
		"despawned = 0\n"
		"changed = 0\n"
		"animEnd = 0\n"
		"offscreen = 0\n"
		"function onSpawn(self, ctx) spawned = 1 end\n"
		"function onTick(self, ctx, dt) ticked = dt end\n"
		"function onCollision(self, ctx, other, collision) collided = 1 end\n"
		"function onDamage(self, ctx, amount, source) damaged = amount; return amount * 2 end\n"
		"function onDeath(self, ctx) dead = 1 end\n"
		"function onDespawn(self, ctx, reason) despawned = 1 end\n"
		"function onScriptChanged(self, ctx, oldId, newId) changed = 1 end\n"
		"function onAnimationEnd(self, ctx) animEnd = 1 end\n"
		"function onOffscreen(self, ctx) offscreen = 1 end\n"
	};
	SetupBindingsAndScripts(1, objectTypeIds, scriptIds, 1, resourceScriptIds, sources);
	Mock_InitObjectList();
	
	tObject *obj = NewObject(gFirstObj, 200);
	Script_SetObjectScript(obj, 200);
	assert(obj->scriptId == 101);
	
	Script_OnSpawn(obj);
	lua_State *L = Test_GetScriptState(101);
	assert(GetLuaGlobalInt(L, "spawned") == 1);
	
	Script_OnTick(obj, 0.5f);
	lua_getglobal(L, "ticked");
	double tick_val = lua_tonumber(L, -1);
	lua_pop(L, 1);
	assert(fabs(tick_val - 0.5) < 0.001);
	
	Script_OnCollision(obj, gFirstObj);
	assert(GetLuaGlobalInt(L, "collided") == 1);
	
	float dam = Script_OnDamage(obj, 5.0f, gFirstObj);
	assert(GetLuaGlobalInt(L, "damaged") == 5);
	assert(fabs(dam - 10.0f) < 0.001);
	
	Script_OnAnimationEnd(obj);
	assert(GetLuaGlobalInt(L, "animEnd") == 1);
	
	Script_OnOffscreen(obj);
	assert(GetLuaGlobalInt(L, "offscreen") == 1);
	
	Script_OnDeath(obj);
	assert(GetLuaGlobalInt(L, "dead") == 1);
	
	Script_ClearObjectState(obj);
	assert(GetLuaGlobalInt(L, "despawned") == 1);
	
	// Test onScriptChanged
	tObject *obj2 = NewObject(gFirstObj, 200);
	Script_SetObjectScript(obj2, 200);
	Script_OnSpawn(obj2);
	// We change script by calling set script map to a new binding
	SInt16 newObjectTypes[] = { 200 };
	SInt16 newScriptIds[] = { 102 }; // Bind 200 to 102
	int newResIds[] = { 101, 102 };
	const char *newSources[] = {
		sources[0],
		"changed = 0\n"
		"function onSpawn(self, ctx) end\n"
		"function onScriptChanged(self, ctx, oldId, newId) changed = 1 end\n"
	};
	// Setup bindings again
	SetupBindingsAndScripts(1, newObjectTypes, newScriptIds, 2, newResIds, newSources);
	// The runtime binding count is updated, now rebind obj2
	Script_SetObjectScript(obj2, 200);
	
	L = Test_GetScriptState(102);
	assert(GetLuaGlobalInt(L, "changed") == 1);
	
	RemoveObject(obj2);
	printf("  -> Passed!\n");
}

void test_SelfAPI(void)
{
	printf("Running test_SelfAPI...\n");
	SInt16 objectTypeIds[] = { 200 };
	SInt16 scriptIds[] = { 101 };
	int resourceScriptIds[] = { 101 };
	const char *sources[] = {
		"function onSpawn(self, ctx)\n"
		"  self:setPosition(120, 240)\n"
		"  self:setVelocity(10, -5)\n"
		"  self:addVelocity(2, 2)\n"
		"  self:setDirection(1.5)\n"
		"  self:setFrame(3)\n"
		"  self:setDamage(40)\n"
		"  self:setLayer(2)\n"
		"  self:setFrameDuration(10)\n"
		"  ret_x = self:x()\n"
		"  ret_y = self:y()\n"
		"  ret_vx = self:velocityX()\n"
		"  ret_vy = self:velocityY()\n"
		"  ret_dir = self:direction()\n"
		"  ret_frm = self:frame()\n"
		"  ret_dmg = self:damage()\n"
		"  ret_layer = self:layer()\n"
		"  ret_type = self:typeId()\n"
		"  ret_exists = self:exists()\n"
		"end\n"
	};
	SetupBindingsAndScripts(1, objectTypeIds, scriptIds, 1, resourceScriptIds, sources);
	Mock_InitObjectList();
	
	tObject *obj = NewObject(gFirstObj, 200);
	Script_SetObjectScript(obj, 200);
	
	Script_OnSpawn(obj);
	
	lua_State *L = Test_GetScriptState(101);
	// Assert native fields were updated
	assert(fabs(obj->pos.x - 120.0f) < 0.001);
	assert(fabs(obj->pos.y - 240.0f) < 0.001);
	assert(fabs(obj->velo.x - 12.0f) < 0.001);
	assert(fabs(obj->velo.y - -3.0f) < 0.001);
	assert(fabs(obj->dir - 1.5f) < 0.001);
	assert(obj->frame == 3);
	assert(fabs(obj->damage - 40.0f) < 0.001);
	assert(obj->layer == 2);
	assert(fabs(obj->frameDuration - 10.0f) < 0.001);
	
	// Assert Lua returned correct values
	assert(fabs(GetLuaGlobalInt(L, "ret_x") - 120.0f) < 0.001);
	assert(fabs(GetLuaGlobalInt(L, "ret_y") - 240.0f) < 0.001);
	assert(fabs(GetLuaGlobalInt(L, "ret_vx") - 12.0f) < 0.001);
	assert(fabs(GetLuaGlobalInt(L, "ret_vy") - -3.0f) < 0.001);
	
	lua_getglobal(L, "ret_dir");
	double ret_dir_val = lua_tonumber(L, -1);
	lua_pop(L, 1);
	assert(fabs(ret_dir_val - 1.5) < 0.001);
	
	assert(GetLuaGlobalInt(L, "ret_frm") == 3);
	assert(GetLuaGlobalInt(L, "ret_dmg") == 40);
	assert(GetLuaGlobalInt(L, "ret_layer") == 2);
	assert(GetLuaGlobalInt(L, "ret_type") == 200);
	assert(GetLuaGlobalInt(L, "ret_exists") == 1);
	
	RemoveObject(obj);
	printf("  -> Passed!\n");
}

void test_CtxAPI(void)
{
	printf("Running test_CtxAPI...\n");
	SInt16 objectTypeIds[] = { 200 };
	SInt16 scriptIds[] = { 101 };
	int resourceScriptIds[] = { 101 };
	const char *sources[] = {
		"function onSpawn(self, ctx)\n"
		"  ctx:setTimer(\"my_timer\", 1.5)\n"
		"  t_rem = ctx:timerRemaining(\"my_timer\")\n"
		"  ctx:after(3.0, \"my_schedule\")\n"
		"  ctx:every(5.0, \"my_repeat\")\n"
		"  ctx:setPlayerNearRadius(100.0)\n"
		"  ctx:addScore(500)\n"
		"end\n"
	};
	SetupBindingsAndScripts(1, objectTypeIds, scriptIds, 1, resourceScriptIds, sources);
	Mock_InitObjectList();
	
	tObject *obj = NewObject(gFirstObj, 200);
	Script_SetObjectScript(obj, 200);
	
	tObject *player = NewObject(gFirstObj, 100);
	gPlayerObj = player;
	player->pos = P2D(0, 0);
	obj->pos = P2D(200, 200); // Distance is ~282, which is > 100
	
	Script_OnSpawn(obj);
	
	// Assertions
	assert(Test_GetActiveTimerCount() == 3); // my_timer, my_schedule, my_repeat
	assert(gPlayerScore == 500);
	assert(Test_GetActiveWatcherCount() == 1);
	
	RemoveObject(obj);
	RemoveObject(player);
	gPlayerObj = NULL;
	printf("  -> Passed!\n");
}

void test_SandboxAndGlobals(void)
{
	printf("Running test_SandboxAndGlobals...\n");
	SInt16 objectTypeIds[] = { 200 };
	SInt16 scriptIds[] = { 101 };
	int resourceScriptIds[] = { 101 };
	const char *sources[] = {
		"io_is_nil = (io == nil)\n"
		"os_is_nil = (os == nil)\n"
		"debug_is_nil = (debug == nil)\n"
		"package_is_nil = (package == nil)\n"
		"require_is_nil = (require == nil)\n"
		"dofile_is_nil = (dofile == nil)\n"
		"loadfile_is_nil = (loadfile == nil)\n"
		"load_is_nil = (load == nil)\n"
	};
	SetupBindingsAndScripts(1, objectTypeIds, scriptIds, 1, resourceScriptIds, sources);
	lua_State *L = Test_GetScriptState(101);
	
	assert(GetLuaGlobalInt(L, "io_is_nil") == 1);
	assert(GetLuaGlobalInt(L, "os_is_nil") == 1);
	assert(GetLuaGlobalInt(L, "debug_is_nil") == 1);
	assert(GetLuaGlobalInt(L, "package_is_nil") == 1);
	assert(GetLuaGlobalInt(L, "require_is_nil") == 1);
	assert(GetLuaGlobalInt(L, "dofile_is_nil") == 1);
	assert(GetLuaGlobalInt(L, "loadfile_is_nil") == 1);
	assert(GetLuaGlobalInt(L, "load_is_nil") == 1);
	printf("  -> Passed!\n");
}

void test_StateCleanup(void)
{
	printf("Running test_StateCleanup...\n");
	SInt16 objectTypeIds[] = { 200 };
	SInt16 scriptIds[] = { 101 };
	int resourceScriptIds[] = { 101 };
	const char *sources[] = {
		"function onSpawn(self, ctx)\n"
		"  self:setState(\"tick_count\", 0)\n"
		"  ctx:setScriptState(\"shared\", 99)\n"
		"  ctx:setLevelState(\"lvl_state\", 55)\n"
		"end\n"
		"function onTick(self, ctx, dt)\n"
		"  local cnt = self:getState(\"tick_count\") or 0\n"
		"  self:setState(\"tick_count\", cnt + 1)\n"
		"end\n"
	};
	SetupBindingsAndScripts(1, objectTypeIds, scriptIds, 1, resourceScriptIds, sources);
	Mock_InitObjectList();
	
	tObject *obj = NewObject(gFirstObj, 200);
	Script_SetObjectScript(obj, 200);
	
	Script_OnSpawn(obj);
	lua_State *L = Test_GetScriptState(101);
	
	// Verify state initialized
	Script_OnTick(obj, 0.1f);
	Script_OnTick(obj, 0.1f);
	
	// Retrieve object local state
	lua_getglobal(L, "__recklessObjectState");
	assert(lua_istable(L, -1));
	lua_pushinteger(L, obj->scriptObjectId);
	lua_gettable(L, -2);
	assert(lua_istable(L, -1));
	lua_getfield(L, -1, "tick_count");
	assert(lua_tointeger(L, -1) == 2);
	lua_pop(L, 3);
	
	// Retrieve shared and level state
	lua_getglobal(L, "__recklessScriptState");
	assert(lua_istable(L, -1));
	lua_getfield(L, -1, "shared");
	assert(lua_tointeger(L, -1) == 99);
	lua_pop(L, 2);
	
	lua_getglobal(L, "__recklessLevelState");
	assert(lua_istable(L, -1));
	lua_getfield(L, -1, "lvl_state");
	assert(lua_tointeger(L, -1) == 55);
	lua_pop(L, 2);
	
	// Now clear object state and make sure object local state is removed
	Script_ClearObjectState(obj);
	lua_getglobal(L, "__recklessObjectState");
	lua_pushinteger(L, obj->scriptObjectId);
	lua_gettable(L, -2);
	assert(lua_isnil(L, -1));
	lua_pop(L, 2);
	
	// Reset level and make sure level state is reset
	Script_ClearCurrentLevel();
	lua_getglobal(L, "__recklessLevelState");
	lua_getfield(L, -1, "lvl_state");
	assert(lua_isnil(L, -1));
	lua_pop(L, 2);
	
	RemoveObject(obj);
	printf("  -> Passed!\n");
}

void test_CapacityLimits(void)
{
	printf("Running test_CapacityLimits...\n");
	SInt16 objectTypeIds[] = { 200 };
	SInt16 scriptIds[] = { 101 };
	int resourceScriptIds[] = { 101 };
	const char *sources[] = {
		"spawn_count = 0\n"
		"function onSpawn(self, ctx)\n"
		"  for i = 1, 10 do\n"
		"    local child = ctx:spawnRelative(200, 0, 0, 0, 0)\n"
		"    if child then\n"
		"      spawn_count = spawn_count + 1\n"
		"    end\n"
		"  end\n"
		"end\n"
	};
	SetupBindingsAndScripts(1, objectTypeIds, scriptIds, 1, resourceScriptIds, sources);
	Mock_InitObjectList();
	
	tObject *obj = NewObject(gFirstObj, 200);
	Script_SetObjectScript(obj, 200);
	
	Script_OnSpawn(obj);
	
	lua_State *L = Test_GetScriptState(101);
	assert(GetLuaGlobalInt(L, "spawn_count") == 8); // clamped by kMaxScriptSpawnsPerHook
	
	RemoveObject(obj);
	printf("  -> Passed!\n");
}

static void SetupBindingsScriptsAndLevelBindings(
	int bindingCount, SInt16 *objectTypeIds, SInt16 *scriptIds,
	int levelBindingCount, UInt16 *levelResourceIds, UInt16 *levelScriptIds,
	int scriptCount, int *resourceScriptIds, const char **scriptSources
)
{
	Script_Shutdown();
	ClearFakeResources();
	
	Size mapSize;
	UInt8 *mapPayload = CreateScMpPayload(bindingCount, objectTypeIds, scriptIds, NULL, &mapSize);
	AddFakeResource(kScriptMapResourceType, 128, mapPayload, mapSize);
	free(mapPayload);

	if (levelBindingCount > 0) {
		Size lvlMapSize;
		UInt8 *lvlMapPayload = CreateScLvPayload(levelBindingCount, levelResourceIds, levelScriptIds, NULL, &lvlMapSize);
		AddFakeResource(kLevelScriptMapResourceType, 128, lvlMapPayload, lvlMapSize);
		free(lvlMapPayload);
	}
	
	for (int i = 0; i < scriptCount; i++) {
		Size scrpSize;
		char name[32];
		snprintf(name, sizeof(name), "Script %d", resourceScriptIds[i]);
		UInt8 *scrpPayload = CreateScrpPayload(name, scriptSources[i], &scrpSize);
		AddFakeResource(kScriptResourceType, resourceScriptIds[i], scrpPayload, scrpSize);
		free(scrpPayload);
	}
	
	Script_Init();
}

void test_RemainingHooksAndAPIs(void)
{
	printf("Running test_RemainingHooksAndAPIs...\n");
	SInt16 objectTypeIds[] = { 200, 201 };
	SInt16 scriptIds[] = { 101, 102 };
	UInt16 levelResourceIds[] = { 0, 13 };
	UInt16 levelScriptIds[] = { 103, 104 };
	int resourceScriptIds[] = { 101, 102, 103, 104 };
	const char *sources[] = {
		// Script 101: Object type 200
		"child_spawned_type = 0\n"
		"timer_fired = \"\"\n"
		"schedule_fired = \"\"\n"
		"s2_fired = 0\n"
		"near_count = 0\n"
		"far_count = 0\n"
		"pickup_player_type = 0\n"
		"exist_obj = false\n"
		"exist_snd = false\n"
		"exist_frm = false\n"
		"exist_obj_fail = true\n"
		"p_x = 0\n"
		"p_y = 0\n"
		"p_spd = 0\n"
		"p_dmg = 0\n"
		"val_max_dmg = 0\n"
		"val_score = 0\n"
		"val_mass = 0\n"
		"val_width = 0\n"
		"val_length = 0\n"
		"val_flags = 0\n"
		"val_flags2 = 0\n"
		"val_control = 0\n"
		"self_exists = false\n"
		"self_is_player = true\n"
		"self_dist = 0\n"
		"self_angle = 0\n"
		"val_child_count = -1\n"
		"val_child_count_after = -1\n"
		"function onSpawn(self, ctx)\n"
		"  local child = ctx:findNearestObject(201, 100.0)\n"
		"  if child then\n"
		"    self:addChild(child)\n"
		"    val_child_count = self:childCount()\n"
		"    self_dist = self:distanceTo(child)\n"
		"    self_angle = self:angleTo(child)\n"
		"    self:removeChild(child)\n"
		"    val_child_count_after = self:childCount()\n"
		"  end\n"
		"  ctx:setTimer(\"t1\", 1.0)\n"
		"  ctx:after(2.0, \"s1\")\n"
		"  ctx:every(0.5, \"s2\")\n"
		"  ctx:cancelSchedule(\"s2\")\n"
		"  ctx:setPlayerNearRadius(100.0)\n"
		"  exist_obj = ctx:objectTypeExists(200)\n"
		"  exist_snd = ctx:soundExists(150)\n"
		"  exist_frm = ctx:frameExists(350)\n"
		"  exist_obj_fail = ctx:objectTypeExists(999)\n"
		"  p_x = ctx:playerX()\n"
		"  p_y = ctx:playerY()\n"
		"  p_spd = ctx:playerSpeed()\n"
		"  p_dmg = ctx:playerDamage()\n"
		"  val_max_dmg = self:maxDamage()\n"
		"  val_score = self:scoreValue()\n"
		"  val_mass = self:mass()\n"
		"  val_width = self:width()\n"
		"  val_length = self:length()\n"
		"  val_flags = self:flags()\n"
		"  val_flags2 = self:flags2()\n"
		"  self:setControl(3)\n"
		"  val_control = self:control()\n"
		"  self:setInput(0.5, -0.2)\n"
		"  self_exists = self:exists()\n"
		"  self_is_player = self:isPlayer()\n"
		"  ctx:playSound(150)\n"
		"  ctx:fireWeapon(151)\n"
		"end\n"
		"function onSpawnedChild(self, ctx, child)\n"
		"  child_spawned_type = child:typeId()\n"
		"end\n"
		"function onTimer(self, ctx, name)\n"
		"  timer_fired = name\n"
		"end\n"
		"function onSchedule(self, ctx, name)\n"
		"  schedule_fired = name\n"
		"  if name == \"s2\" then s2_fired = s2_fired + 1 end\n"
		"end\n"
		"function onPlayerNear(self, ctx, dist)\n"
		"  near_count = near_count + 1\n"
		"end\n"
		"function onPlayerFar(self, ctx, dist)\n"
		"  far_count = far_count + 1\n"
		"end\n"
		"function onPickup(self, ctx, player)\n"
		"  pickup_player_type = player:typeId()\n"
		"end\n"
		"function onTick(self, ctx, dt)\n"
		"  if dt == 99.0 then\n"
		"    self:remove()\n"
		"  elseif dt == 98.0 then\n"
		"    self:kill()\n"
		"  end\n"
		"end\n",

		// Script 102: Object type 201
		"parent_type = 0\n"
		"function onSpawnedBy(self, ctx, parent)\n"
		"  parent_type = parent:typeId()\n"
		"end\n",

		// Script 103: Global Level Script
		"level_start_global = 0\n"
		"level_tick_global = 0.0\n"
		"level_complete_global = 0\n"
		"respawn_type_global = 0\n"
		"addon_roll_global = -1\n"
		"function onLevelStart(ctx)\n"
		"  level_start_global = level_start_global + 1\n"
		"end\n"
		"function onLevelTick(ctx, dt)\n"
		"  level_tick_global = level_tick_global + dt\n"
		"end\n"
		"function onLevelComplete(ctx)\n"
		"  level_complete_global = level_complete_global + 1\n"
		"end\n"
		"function onPlayerRespawn(ctx, player)\n"
		"  respawn_type_global = player:typeId()\n"
		"end\n"
		"function onAddOnAward(ctx, roll)\n"
		"  addon_roll_global = roll\n"
		"end\n",

		// Script 104: Level 1 specific script
		"level_start_spec = 0\n"
		"level_tick_spec = 0.0\n"
		"level_complete_spec = 0\n"
		"respawn_type_spec = 0\n"
		"addon_roll_spec = -1\n"
		"lvl_num = 0\n"
		"lvl_res_id = 0\n"
		"lvl_end_y = 0.0\n"
		"function onLevelStart(ctx)\n"
		"  level_start_spec = level_start_spec + 1\n"
		"  lvl_num = ctx:levelNumber()\n"
		"  lvl_res_id = ctx:levelResourceId()\n"
		"  lvl_end_y = ctx:levelEndY()\n"
		"end\n"
		"function onLevelTick(ctx, dt)\n"
		"  level_tick_spec = level_tick_spec + dt\n"
		"end\n"
		"function onLevelComplete(ctx)\n"
		"  level_complete_spec = level_complete_spec + 1\n"
		"end\n"
		"function onPlayerRespawn(ctx, player)\n"
		"  respawn_type_spec = player:typeId()\n"
		"end\n"
		"function onAddOnAward(ctx, roll)\n"
		"  addon_roll_spec = roll\n"
		"end\n"
	};

	SetupBindingsScriptsAndLevelBindings(2, objectTypeIds, scriptIds, 2, levelResourceIds, levelScriptIds, 4, resourceScriptIds, sources);
	Mock_InitObjectList();

	// Create parent and child objects
	tObject *parent = NewObject(gFirstObj, 200);
	parent->pos = P2D(0, 0);
	parent->type->maxDamage = 50.0f;
	parent->type->score = 1000;
	parent->type->mass = 1200.0f;
	parent->type->width = 1.8f;
	parent->type->length = 4.2f;
	parent->type->flags = 0xAA;
	parent->type->flags2 = 0x55;

	tObject *child = NewObject(gFirstObj, 201);
	child->pos = P2D(10, 10);

	// Setup player
	tObject *player = NewObject(gFirstObj, 100);
	player->pos = P2D(200, 0);
	player->damage = 25.0f;
	player->velo = P2D(12.0f, 0.0f);
	gPlayerObj = player;

	// Setup camera
	tObject *camera = NewObject(gFirstObj, 999);
	camera->pos = P2D(0, 0);
	gCameraObj = camera;

	// Setup level details
	tLevelData lvlData;
	lvlData.levelEnd = 5000.0f;
	gLevelData = &lvlData;
	gLevelID = 1;

	// Set scripts on parent & child
	Script_SetObjectScript(parent, 200);
	Script_SetObjectScript(child, 201);

	// Run Spawn on parent (which will trigger findNearestObject, addChild, and parent-child hooks)
	Script_OnSpawn(parent);

	lua_State *L1 = Test_GetScriptState(101);
	lua_State *L2 = Test_GetScriptState(102);

	// Verify child spawned hook results
	assert(GetLuaGlobalInt(L1, "child_spawned_type") == 201);
	assert(GetLuaGlobalInt(L2, "parent_type") == 200);

	// Verify childCount, removeChild (which we did inside Lua script)
	assert(GetLuaGlobalInt(L1, "val_child_count") == 1);
	assert(GetLuaGlobalInt(L1, "val_child_count_after") == 0);
	assert(child->scriptOwnerObjectId == 0);

	// Verify parent metadata getters
	assert(GetLuaGlobalInt(L1, "val_max_dmg") == 50);
	assert(GetLuaGlobalInt(L1, "val_score") == 1000);
	assert(GetLuaGlobalInt(L1, "val_mass") == 1200);
	assert(GetLuaGlobalInt(L1, "val_flags") == 0xAA);
	assert(GetLuaGlobalInt(L1, "val_flags2") == 0x55);
	assert(fabs(parent->input.throttle - 0.5f) < 0.001);
	assert(fabs(parent->input.steering - -0.2f) < 0.001);
	assert(GetLuaGlobalInt(L1, "val_control") == 3);
	assert(parent->control == 3);
	assert(GetLuaGlobalInt(L1, "self_exists") == 1);
	assert(GetLuaGlobalInt(L1, "self_is_player") == 0);

	// Verify distanceTo / angleTo
	lua_getglobal(L1, "self_dist");
	double self_dist = lua_tonumber(L1, -1);
	lua_pop(L1, 1);
	assert(fabs(self_dist - 14.142) < 0.01);

	lua_getglobal(L1, "self_angle");
	double self_angle = lua_tonumber(L1, -1);
	lua_pop(L1, 1);
	assert(fabs(self_angle - atan2(10.0, 10.0)) < 0.01);

	// Verify player getters
	assert(GetLuaGlobalInt(L1, "p_x") == 200);
	assert(GetLuaGlobalInt(L1, "p_y") == 0);
	assert(GetLuaGlobalInt(L1, "p_spd") == 12);
	assert(GetLuaGlobalInt(L1, "p_dmg") == 25);

	// Verify exist checks
	assert(GetLuaGlobalInt(L1, "exist_obj") == 1);
	assert(GetLuaGlobalInt(L1, "exist_snd") == 1);
	assert(GetLuaGlobalInt(L1, "exist_frm") == 1);
	assert(GetLuaGlobalInt(L1, "exist_obj_fail") == 0);

	// Proximity transition checks
	Script_OnTick(parent, 0.1f);
	assert(GetLuaGlobalInt(L1, "near_count") == 0);
	assert(GetLuaGlobalInt(L1, "far_count") == 0);

	player->pos = P2D(50, 0); // moves near
	Script_OnTick(parent, 0.1f);
	assert(GetLuaGlobalInt(L1, "near_count") == 1);
	assert(GetLuaGlobalInt(L1, "far_count") == 0);

	player->pos = P2D(150, 0); // moves far
	Script_OnTick(parent, 0.1f);
	assert(GetLuaGlobalInt(L1, "near_count") == 1);
	assert(GetLuaGlobalInt(L1, "far_count") == 1);

	// Timers & schedules tick checks
	Script_OnTick(parent, 0.5f);
	lua_getglobal(L1, "timer_fired");
	assert(strcmp(lua_tostring(L1, -1), "") == 0);
	lua_pop(L1, 1);

	Script_OnTick(parent, 0.5f); // cumulative 1.1s
	lua_getglobal(L1, "timer_fired");
	assert(strcmp(lua_tostring(L1, -1), "t1") == 0);
	lua_pop(L1, 1);

	Script_OnTick(parent, 1.0f); // cumulative 2.1s
	lua_getglobal(L1, "schedule_fired");
	assert(strcmp(lua_tostring(L1, -1), "s1") == 0);
	lua_pop(L1, 1);

	// verify canceled schedule s2 did not run
	assert(GetLuaGlobalInt(L1, "s2_fired") == 0);

	// Level script checks
	Script_SetCurrentLevel(13);
	Script_OnLevelStart();

	lua_State *L_global = Test_GetScriptState(103);
	lua_State *L_spec = Test_GetScriptState(104);
	assert(L_global != NULL);
	assert(L_spec != NULL);

	assert(GetLuaGlobalInt(L_global, "level_start_global") == 1);
	assert(GetLuaGlobalInt(L_spec, "level_start_spec") == 1);
	assert(GetLuaGlobalInt(L_spec, "lvl_num") == 2);
	assert(GetLuaGlobalInt(L_spec, "lvl_res_id") == 13);
	assert(GetLuaGlobalInt(L_spec, "lvl_end_y") == 5000);

	Script_OnLevelTick(0.2f);
	Script_OnLevelTick(0.3f);

	lua_getglobal(L_global, "level_tick_global");
	double tick_glob = lua_tonumber(L_global, -1);
	lua_pop(L_global, 1);
	assert(fabs(tick_glob - 0.5) < 0.001);

	lua_getglobal(L_spec, "level_tick_spec");
	double tick_spec = lua_tonumber(L_spec, -1);
	lua_pop(L_spec, 1);
	assert(fabs(tick_spec - 0.5) < 0.001);

	Script_OnPickup(parent, player);
	assert(GetLuaGlobalInt(L1, "pickup_player_type") == 100);

	Script_OnLevelComplete();
	Script_OnPlayerRespawn(player);
	Script_OnAddOnAward(5);
	assert(GetLuaGlobalInt(L_global, "level_complete_global") == 1);
	assert(GetLuaGlobalInt(L_spec, "level_complete_spec") == 1);
	assert(GetLuaGlobalInt(L_global, "respawn_type_global") == 100);
	assert(GetLuaGlobalInt(L_spec, "respawn_type_spec") == 100);
	assert(GetLuaGlobalInt(L_global, "addon_roll_global") == 5);
	assert(GetLuaGlobalInt(L_spec, "addon_roll_spec") == 5);

	// Lifecycle remove and kill checks
	Script_OnTick(parent, 99.0f);
	assert(parent->scriptRemoveRequested == true);
	assert(Script_DrainDeferredRemoval(parent) == true);
	assert(ObjectIsLive(parent) == false);

	parent = NewObject(gFirstObj, 200);
	parent->pos = P2D(0, 0);
	Script_SetObjectScript(parent, 200);

	Script_OnTick(parent, 98.0f);
	assert(parent->scriptRemoveRequested == true);
	assert(Script_DrainDeferredRemoval(parent) == true);
	assert(ObjectIsLive(parent) == false);

	// Clean up objects
	Mock_InitObjectList();
	gPlayerObj = NULL;
	gCameraObj = NULL;
	gLevelData = NULL;

	printf("  -> Passed!\n");
}

int main(int argc, char **argv)
{
	printf("===========================================\n");
	printf("      LUA SCRIPT RUNTIME UNIT TESTS        \n");
	printf("===========================================\n");
	
	InitTrigTable();

#ifndef HAVE_LUA_SCRIPTING
	printf("HAVE_LUA_SCRIPTING is not defined! Tests skipped.\n");
	return 1;
#endif

	test_ParserAndBindingLoad();
	test_HookDispatch();
	test_SelfAPI();
	test_CtxAPI();
	test_SandboxAndGlobals();
	test_StateCleanup();
	test_CapacityLimits();
	test_RemainingHooksAndAPIs();
	
	printf("===========================================\n");
	printf("          ALL TESTS PASSED SUCCESSFULLY!    \n");
	printf("===========================================\n");
	return 0;
}
