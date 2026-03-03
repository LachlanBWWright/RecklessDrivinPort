#include <stdlib.h>
#include "packs.h"
#include "lzrwHandleInterface.h"
#include "register.h"
#include "interface.h"

typedef struct{
	SInt16 id;
	SInt16 placeHolder;
	UInt32 offs;
}tPackHeader;
typedef tPackHeader **tPackHandle;

Handle gPacks[kNumPacks];
#define kUnCryptedHeader 256

/*
 * Pack data is stored in Mac big-endian byte order.
 * On little-endian platforms we must byte-swap when reading
 * tPackHeader fields (SInt16 id, UInt32 offs).
 */
#if __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__
static inline SInt16 PACK_ID(const tPackHeader *h)   { return (SInt16)(((h->id & 0xFF) << 8) | ((h->id >> 8) & 0xFF)); }
static inline UInt32 PACK_OFFS(const tPackHeader *h) {
    UInt32 v = h->offs;
    return ((v & 0xFF000000u) >> 24) | ((v & 0x00FF0000u) >> 8) |
           ((v & 0x0000FF00u) <<  8) | ((v & 0x000000FFu) << 24);
}
#else
static inline SInt16 PACK_ID(const tPackHeader *h)   { return h->id; }
static inline UInt32 PACK_OFFS(const tPackHeader *h) { return h->offs; }
#endif

UInt32 CryptData(UInt32 *data,UInt32 len)
{
	UInt32 check=0;
	data+=kUnCryptedHeader/4;
	len-=kUnCryptedHeader;
	while(len>=4)
	{
		*data^=gKey;
		check+=*data;
		data++;
		len-=4;
   	}
	if(len)
	{
		UInt8 *byteData = (UInt8*)data;
		*byteData^=gKey>>24;
		check+=(*byteData++)<<24;
		if(len>1)
		{
			*byteData^=(gKey>>16)&0xff;
			check+=(*byteData++)<<16;
			if(len>2)
			{
				*byteData^=(gKey>>8)&0xff;
				check+=(*byteData++)<<8;
			}
		}
	}
	return check;
}


UInt32 LoadPack(int num)
{
	UInt32 check=0;
	if(!gPacks[num])
	{
		gPacks[num]=GetResource('Pack',num+128);
		if(gPacks[num])
		{
			if(num>=kEncryptedPack||gLevelResFile)
				check=CryptData(*gPacks[num],GetHandleSize(gPacks[num]));
			LZRWDecodeHandle(&gPacks[num]);
			HLockHi(gPacks[num]);
		}
	}
	return check;
}

int CheckPack(int num,UInt32 check)
{
	int ok=false;
	UseResFile(gAppResFile);
	if(!gPacks[num])
	{
		gPacks[num]=GetResource('Pack',num+128);
		if(gPacks[num])
		{
			if(num>=kEncryptedPack)
				ok=check==CryptData(*gPacks[num],GetHandleSize(gPacks[num]));
			ReleaseResource(gPacks[num]);
			gPacks[num]=nil;
		}
	}
	if(gLevelResFile)
		UseResFile(gLevelResFile);
	return ok;
}

void UnloadPack(int num)
{
	if(gPacks[num])
	{
		DisposeHandle(gPacks[num]);
		gPacks[num]=nil;
	}
}

Ptr GetSortedPackEntry(int packNum,int entryID,int *size)
{
	tPackHeader *pack=(tPackHeader*)*gPacks[packNum];
	int startId=PACK_ID(&pack[1]);
	UInt32 offs=PACK_OFFS(&pack[entryID-startId+1]);
	if(size)
		if(entryID-startId+1==PACK_ID(pack))
			*size=GetHandleSize(gPacks[packNum])-offs;
		else
			*size=PACK_OFFS(&pack[entryID-startId+2])-offs;
	return (Ptr)pack+offs;
}

int ComparePackHeaders(const tPackHeader *p1,const tPackHeader *p2)
{
	return PACK_ID(p1)-PACK_ID(p2);
}

Ptr GetUnsortedPackEntry(int packNum,int entryID,int *size)
{
	tPackHeader *pack=(tPackHeader*)*gPacks[packNum];
	tPackHeader key,*found;
	UInt32 offs;
	/* For bsearch key, store ID in big-endian (same as on-disk format) */
#if __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__
	key.id = (SInt16)(((entryID & 0xFF) << 8) | ((entryID >> 8) & 0xFF));
#else
	key.id = entryID;
#endif
	found=bsearch(&key,pack+1,PACK_ID(pack),sizeof(tPackHeader),ComparePackHeaders);
	if(found)
	{
		offs=PACK_OFFS(found);
		if(size)
			if(PACK_ID(pack)==found-pack)
				*size=GetHandleSize(gPacks[packNum])-offs;
			else
				*size=PACK_OFFS(found+1)-offs;
		return (Ptr)pack+offs;
	}
	else return 0;
}

int NumPackEntries(int num)
{
	if (!gPacks[num]) return 0;
	tPackHeader *pack = (tPackHeader*)*gPacks[num];
	return PACK_ID(pack);
}

/* Get pack entry by 1-based position in the header array.
 * Position 1 = first entry, position n = last entry.
 * Unlike GetSortedPackEntry this does not assume sequential IDs,
 * so it can iterate every entry in a pack regardless of ID gaps. */
Ptr GetPackEntryByPos(int packNum, int pos, int *size)
{
	tPackHeader *pack;
	int n;
	UInt32 offs;
	if (!gPacks[packNum]) return 0;
	pack = (tPackHeader*)*gPacks[packNum];
	n = PACK_ID(pack);
	if (pos < 1 || pos > n) return 0;
	offs = PACK_OFFS(&pack[pos]);
	if (size) {
		if (pos == n)
			*size = (int)GetHandleSize(gPacks[packNum]) - (int)offs;
		else
			*size = (int)PACK_OFFS(&pack[pos+1]) - (int)offs;
	}
	return (Ptr)pack + offs;
}