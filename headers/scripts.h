#ifndef __SCRIPTS
#define __SCRIPTS

#include "objects.h"

void Script_Init(void);
void Script_Shutdown(void);
void Script_SetObjectScript(tObject *theObj, SInt16 typeRes);
void Script_OnSpawn(tObject *theObj);
void Script_OnTick(tObject *theObj, float dt);
void Script_OnCollision(tObject *theObj, tObject *otherObj);
float Script_OnDamage(tObject *theObj, float amount, tObject *sourceObj);
void Script_OnDeath(tObject *theObj);
void Script_OnAnimationEnd(tObject *theObj);
void Script_OnOffscreen(tObject *theObj);
void Script_OnPickup(tObject *theObj, tObject *playerObj);
int Script_DrainDeferredRemoval(tObject *theObj);
void Script_ClearObjectState(tObject *theObj);
void Script_LinkSpawnedChild(tObject *parentObj, tObject *childObj);
void Script_SetCurrentLevel(SInt16 levelResourceId);
void Script_ClearCurrentLevel(void);
void Script_OnLevelStart(void);
void Script_OnLevelTick(float dt);
void Script_OnLevelComplete(void);
void Script_OnPlayerRespawn(tObject *playerObj);
void Script_OnAddOnAward(int roll);

#endif
