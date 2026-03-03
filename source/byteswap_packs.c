/*
 * byteswap_packs.c
 *
 * In-place big-endian byte-swapping for Mac PPC pack data structures.
 * All game pack data is stored in Mac big-endian format; on little-endian
 * hosts (x86/x86_64) every multi-byte field must be swapped before use.
 *
 * Each swap function is idempotent in the sense that the pack is only loaded
 * once from disk, swapped once right after loading, and then every subsequent
 * access gets native-endian values.
 *
 * Call order (from initexit.c Init() and gameinitexit.c LoadLevel()):
 *   PortByteSwapPackObTy()         -- after LoadPack(kPackObTy)
 *   PortByteSwapPackOgrp()         -- after LoadPack(kPackOgrp)
 *   PortByteSwapPackRoad()         -- after LoadPack(kPackRoad)
 *   PortByteSwapLevelPack(packNum) -- after LoadPack(kPackLevel1+gLevelID)
 *   PortByteSwapSpriteHandle(h)    -- for each sprite Handle in LoadSprites()
 */

#include <stdint.h>
#include <string.h>

#include "packs.h"
#include "roads.h"
#include "objects.h"
#include "byteswap_packs.h"

/* ---- low-level helpers -------------------------------------------------- */

static inline void swap_f32(float *p) {
    uint32_t v;
    memcpy(&v, p, 4);
    v = be32_swap(v);
    memcpy(p, &v, 4);
}
static inline void swap_u32(UInt32 *p) { *p = be32_swap(*p); }
static inline void swap_s32(SInt32 *p) { *p = (SInt32)be32_swap((uint32_t)*p); }
static inline void swap_u16(UInt16 *p) { *p = be16_swap(*p); }
static inline void swap_s16(SInt16 *p) { *p = (SInt16)be16_swap((uint16_t)*p); }

/* ---- struct-level swappers ---------------------------------------------- */

/* tRoadInfo */
static void swap_road_info(tRoadInfo *r) {
    swap_f32(&r->friction);
    swap_f32(&r->airResistance);
    swap_f32(&r->backResistance);
    swap_u16(&r->tolerance);
    swap_s16(&r->marks);
    swap_s16(&r->deathOffs);
    swap_s16(&r->backgroundTex);
    swap_s16(&r->foregroundTex);
    swap_s16(&r->roadLeftBorder);
    swap_s16(&r->roadRightBorder);
    swap_s16(&r->tracks);
    swap_s16(&r->skidSound);
    /* filler is padding - no need to swap */
    swap_f32(&r->xDrift);
    swap_f32(&r->yDrift);
    swap_f32(&r->xFrontDrift);
    swap_f32(&r->yFrontDrift);
    swap_f32(&r->trackSlide);
    swap_f32(&r->dustSlide);
    /* dustColor, water are UInt8 - no swap needed */
    /* filler2 is padding - no need to swap */
    swap_f32(&r->slideFriction);
}

/* tObjectType */
static void swap_object_type(tObjectType *t) {
    swap_f32(&t->mass);
    swap_f32(&t->maxEngineForce);
    swap_f32(&t->maxNegEngineForce);
    swap_f32(&t->friction);
    swap_u16(&t->flags);
    swap_s16(&t->deathObj);
    swap_s16(&t->frame);
    swap_u16(&t->numFrames);
    swap_f32(&t->frameDuration);
    swap_f32(&t->wheelWidth);
    swap_f32(&t->wheelLength);
    swap_f32(&t->steering);
    swap_f32(&t->width);
    swap_f32(&t->length);
    swap_u16(&t->score);
    swap_u16(&t->flags2);
    swap_s16(&t->creationSound);
    swap_s16(&t->otherSound);
    swap_f32(&t->maxDamage);
    swap_s16(&t->weaponObj);
    swap_s16(&t->weaponInfo);
}

/* tObjectGroupEntry */
static void swap_object_group_entry(tObjectGroupEntry *e) {
    swap_s16(&e->typeRes);
    swap_s16(&e->minOffs);
    swap_s16(&e->maxOffs);
    swap_s16(&e->probility);
    swap_f32(&e->dir);
}

/* tTrackInfoSeg */
static void swap_track_seg(tTrackInfoSeg *s) {
    swap_u16(&s->flags);
    swap_s16(&s->x);
    swap_s32(&s->y);
    swap_f32(&s->velo);
}

/* tObjectPos */
static void swap_object_pos(tObjectPos *p) {
    swap_s32(&p->x);
    swap_s32(&p->y);
    swap_f32(&p->dir);
    swap_s16(&p->typeRes);
    /* filler - no swap */
}

/* tMarkSeg */
static void swap_mark_seg(tMarkSeg *m) {
    swap_f32(&m->p1.x);
    swap_f32(&m->p1.y);
    swap_f32(&m->p2.x);
    swap_f32(&m->p2.y);
}

/* tLevelData */
static void swap_level_data(tLevelData *ld) {
    int i;
    swap_s16(&ld->roadInfo);
    swap_u16(&ld->time);
    for (i = 0; i < 10; i++) {
        swap_s16(&ld->objGrps[i].resID);
        swap_s16(&ld->objGrps[i].numObjs);
    }
    swap_s16(&ld->xStartPos);
    swap_u16(&ld->levelEnd);
}

/* ---- NumPackEntries helper ----------------------------------------------- */
/* Returns the count of entries in a pack (from pack[0].id) */
static int pack_count(int packNum) {
    return NumPackEntries(packNum);
}

/* ---- Pack-wide swap functions ------------------------------------------- */

void PortByteSwapPackRoad(void) {
    int i, n = pack_count(kPackRoad);
    int startId = 128; /* kPackRoad entries start at 128 */
    for (i = 0; i < n; i++) {
        tRoadInfo *r = (tRoadInfo *)GetSortedPackEntry(kPackRoad, startId + i, NULL);
        if (r) swap_road_info(r);
    }
}

void PortByteSwapPackObTy(void) {
    int i, n = pack_count(kPackObTy);
    /* Iterate ALL entries by position so high-ID types (debris, explosions,
     * e.g. 195, 1001, 1012, 1014-1016, 1020, 2000) are also byte-swapped.
     * The previous ID-based loop (startId=128, IDs 128..128+n-1) would miss
     * any entry whose ID exceeds 128+n-1, leaving big-endian float fields
     * (mass, width, length, etc.) corrupted on little-endian platforms. */
    for (i = 1; i <= n; i++) {
        tObjectType *t = (tObjectType *)GetPackEntryByPos(kPackObTy, i, NULL);
        if (t) swap_object_type(t);
    }
}

void PortByteSwapPackOgrp(void) {
    int i, j, n = pack_count(kPackOgrp);
    int startId = 128;
    for (i = 0; i < n; i++) {
        tObjectGroup *g = (tObjectGroup *)GetSortedPackEntry(kPackOgrp, startId + i, NULL);
        if (!g) continue;
        /* Swap numEntries first so we know how many entries to iterate */
        swap_u32(&g->numEntries);
        for (j = 0; j < (int)g->numEntries; j++)
            swap_object_group_entry(&g->data[j]);
    }
}

/* Swap the level-specific pack (kPackLevel1+gLevelID) entry 1 blob.
 * The blob layout:
 *   tLevelData
 *   tTrackInfo (up):  UInt32 num + num*tTrackInfoSeg
 *   tTrackInfo (down): UInt32 num + num*tTrackInfoSeg
 *   UInt32 (road length count)
 *   tRoadSeg[] = SInt16[4] * roadLengthCount
 *
 * Also swaps entry 2 (tMarkSeg array) and embedded tObjectPos arrays
 * which LoadObjs creates from the level data.
 */
void PortByteSwapLevelPack(int packNum) {
    int i;
    int markSize;
    tMarkSeg *marks;
    tLevelData *ld;
    tTrackInfo *trackUp, *trackDown;
    Ptr blob;
    int blobSize;

    /* ---- Entry 1: level data blob ---- */
    blob = GetSortedPackEntry(packNum, 1, &blobSize);
    if (!blob) return;
    ld = (tLevelData *)blob;
    swap_level_data(ld);

    /* tTrackInfo (up) immediately follows tLevelData */
    trackUp = (tTrackInfo *)((Ptr)ld + sizeof(tLevelData));
    swap_u32(&trackUp->num);                       /* MUST swap before using num */
    for (i = 0; i < (int)trackUp->num; i++)
        swap_track_seg(&trackUp->track[i]);

    /* tTrackInfo (down) follows tTrackInfo (up) */
    trackDown = (tTrackInfo *)((Ptr)trackUp + sizeof(UInt32) +
                               trackUp->num * sizeof(tTrackInfoSeg));
    swap_u32(&trackDown->num);                     /* MUST swap before using num */
    for (i = 0; i < (int)trackDown->num; i++)
        swap_track_seg(&trackDown->track[i]);

    /* Object block follows trackDown:  UInt32 count + tObjectPos[count].
     * This matches what LoadObjs() consumes in gameinitexit.c. */
    {
        UInt32 *objCount = (UInt32 *)((Ptr)trackDown + sizeof(UInt32) +
                                      trackDown->num * sizeof(tTrackInfoSeg));
        if ((Ptr)(objCount + 1) <= blob + blobSize) {
            swap_u32(objCount);
            for (i = 0; i < (int)*objCount; i++)
                swap_object_pos((tObjectPos *)(objCount + 1) + i);
            /* Road data follows the object block */
            {
                UInt32 *roadLen = (UInt32 *)((tObjectPos *)(objCount + 1) + *objCount);
                if ((Ptr)(roadLen + 1) <= blob + blobSize) {
                    swap_u32(roadLen);
                    {
                        SInt16 *roadData = (SInt16 *)(roadLen + 1);
                        int count = (int)*roadLen * 4;  /* 4 SInt16 values per segment */
                        for (i = 0; i < count; i++)
                            swap_s16(&roadData[i]);
                    }
                }
            }
        }
    }

    /* ---- Entry 2: mark segments ---- */
    marks = (tMarkSeg *)GetSortedPackEntry(packNum, 2, &markSize);
    if (marks) {
        int count = markSize / (int)sizeof(tMarkSeg);
        for (i = 0; i < count; i++)
            swap_mark_seg(&marks[i]);
    }
}

/* Swap the xSize/ySize header fields of an individual sprite Handle.
 * Called from LoadSprites() after each sprite is loaded into a Handle. */
void PortByteSwapSpriteHandle(Handle h) {
    if (!h || !*h) return;
    {
        /* First two fields of tSpriteHeader are UInt16 xSize, ySize */
        UInt16 *xSize = (UInt16 *)(*h);
        UInt16 *ySize = xSize + 1;
        swap_u16(xSize);
        swap_u16(ySize);
        /* The pixel data that follows is raw bytes - no swap needed */
    }
}
