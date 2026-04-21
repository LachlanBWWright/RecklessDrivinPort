#ifndef __BYTESWAP_PACKS_H
#define __BYTESWAP_PACKS_H

/* Swap all tObjectType entries in kPackObTy (called once after LoadPack). */
void PortByteSwapPackObTy(void);

/* Swap all tObjectGroup entries in kPackOgrp (called once after LoadPack). */
void PortByteSwapPackOgrp(void);

/* Swap all tRoadInfo entries in kPackRoad (called once after LoadPack). */
void PortByteSwapPackRoad(void);

/* Swap the level data blob (entry 1 and entry 2) in the given level pack.
 * Must be called BEFORE reading any tLevelData / tTrackInfo / tMarkSeg
 * fields from the pack (i.e. right after LoadPack in LoadLevel). */
void PortByteSwapLevelPack(int packNum);

/* Swap the xSize/ySize header fields of an individual sprite Handle.
 * Call for each sprite Handle immediately after PtrToHand in LoadSprites. */
void PortByteSwapSpriteHandle(Handle h);

/* Swap the raw 16-bit texture entries in kPackTx16. */
void PortByteSwapPackTx16(void);

/* Swap the 16-bit RLE entries in kPacksR16 / kPackcR16. */
void PortByteSwapPackRLE16(int packNum);

#endif /* __BYTESWAP_PACKS_H */
