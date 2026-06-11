#ifndef __SCRIPTS
#define __SCRIPTS

#include "objects.h"

void Script_Init(void);
void Script_Shutdown(void);
void Script_SetObjectScript(tObject *theObj, SInt16 typeRes);
void Script_OnSpawn(tObject *theObj);
void Script_OnTick(tObject *theObj, float dt);
void Script_OnDeath(tObject *theObj);
void Script_OnAnimationEnd(tObject *theObj);
void Script_OnOffscreen(tObject *theObj);

#endif
