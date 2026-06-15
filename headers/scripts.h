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
int Script_DrainDeferredRemoval(tObject *theObj);
void Script_ClearObjectState(tObject *theObj);
void Script_SetCurrentLevel(SInt16 levelResourceId);
void Script_ClearCurrentLevel(void);
void Script_OnLevelStart(void);
void Script_OnLevelTick(float dt);

#endif
