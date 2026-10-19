#include <stdio.h>
#include "initexit.h"
#include "gameinitexit.h"
#include "objects.h"
#include "particlefx.h"
#include "preferences.h"
#include "screen.h"

void BounceObjects(tObject *first, tObject *second);

static void require(int condition, const char *message)
{
    if (!condition)
    {
        fprintf(stderr, "%s\n", message);
        exit(1);
    }
}

int main(void)
{
    tEditorLaunchOptions options = {0};
    Init();
    require(gPrefs.hiColor, "Collision regression requires high-color gameplay");
    options.enabled = 1;
    options.autoStart = 1;
    SetEditorLaunchOptions(&options);
    rd_start_editor_test_drive();
    require(gGameOn && gPlayerObj, "Failed to start the real game");
    require(g16BitClut && *g16BitClut, "Missing particle color lookup");
    require(GetHandleSize(g16BitClut) >= 256 * sizeof(UInt16), "Incomplete particle palette");

    t2DPoint origin = gPlayerObj->pos;
    for (int collision = 0; collision < 16; collision++)
    {
        tObject *other = NewObject(gPlayerObj, kNormalPlayerCarID);
        require(other != NULL, "Failed to create collision target");
        gPlayerObj->pos = origin;
        other->pos = origin;
        other->pos.y += 10;
        gPlayerObj->velo = (t2DPoint){0, 70};
        other->velo = (t2DPoint){0, -70};
        gPlayerObj->damageFlags = 0;
        float previous_damage = gPlayerObj->damage;
        BounceObjects(gPlayerObj, other);
        require(gPlayerObj->damage > previous_damage, "Collision did not inflict damage");
        DrawParticleFXZoomed(origin.x - 320, origin.y + 240, 1, 1);
    }
    /* A palette reload must keep collision effects usable. */
    SetScreenClut(8);
    NewParticleFX(origin, (t2DPoint){0, 0}, 32, 0xf6, 1, 50);
    DrawParticleFXZoomed(origin.x - 320, origin.y + 240, 1, 1);
    DisposeLevel();
    ScreenMode(kScreenStopped);
    puts("Repeated high-color car collisions and particle rendering passed");
    return 0;
}
