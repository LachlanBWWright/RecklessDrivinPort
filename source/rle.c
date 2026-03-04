#include "screen.h"
#include "packs.h"
#include "error.h"
#include "preferences.h"
#include <stdint.h>

#define kEndShapeToken		0				// the end of shape maker
#define kLineStartToken		1				// the line start marker
#define kDrawPixelsToken	2				// the draw run marker
#define kSkipPixelsToken	3				// the skip pixels marker

/*
 * RLE token layout (big-endian Mac format): 4 bytes
 *   byte 0: token type  (kEndShapeToken/kLineStartToken/kDrawPixelsToken/kSkipPixelsToken)
 *   bytes 1-3: payload  (24-bit pixel count or zero)
 *
 * On Mac PPC:  `(*((unsigned long*)p)) & 0x00ffffff` worked because:
 *   - unsigned long was 32-bit  - big-endian, so mask dropped the high (type) byte
 *
 * On Linux x86_64: unsigned long is 64-bit, little-endian, so the expression
 * reads 8 bytes and extracts the wrong bits.  We must read the 3-byte payload
 * explicitly from bytes [1],[2],[3] in big-endian order.
 */
#define TOKEN_TYPE(p)  ((p)[0])
#define TOKEN_DATA(p)  (((SInt32)(p)[1] << 16) | ((SInt32)(p)[2] << 8) | (p)[3])

void DrawRLE8(int h,int v,int id)
{
	int rowBytes=gRowBytes;
	UInt8 *spritePos=GetSortedPackEntry(kPacksRLE,id,nil)+sizeof(Rect);
	UInt8 *lineStart=gBaseAddr+h+v*rowBytes;
	UInt8 *dst=lineStart;
	int stop=0;
	do
	{
		SInt32 tokenData = TOKEN_DATA(spritePos);
		switch (TOKEN_TYPE(spritePos))
		{
			case kDrawPixelsToken:
				{
					int i=0;
					UInt8 *src=spritePos+4;
					/* Advance spritePos by 4 (header) + tokenData bytes, padded to 4-byte boundary */
					spritePos+=4+tokenData+(tokenData&3?(4-(tokenData&3)):0);
					/* Copy tokenData bytes using 4-byte chunks for efficiency */
					while(tokenData-(int)sizeof(uint32_t)>=i)
					{
						*((uint32_t*)(dst+i))=*((uint32_t*)(src+i));
						i+=sizeof(uint32_t);
					}
					if(tokenData-(int)sizeof(uint16_t)>=i)
					{
						*((uint16_t*)(dst+i))=*((uint16_t*)(src+i));
						i+=sizeof(uint16_t);
					}
					if(tokenData-(int)sizeof(uint8_t)>=i)
						*((uint8_t*)(dst+i))=*((uint8_t*)(src+i));
					dst+=tokenData;
				}
				break;
			case kSkipPixelsToken:
				dst+=tokenData;
				spritePos+=4;
				break;
			case kLineStartToken:
				lineStart+=rowBytes;
				dst=lineStart;
				spritePos+=4;
				break;
			case kEndShapeToken:
				stop=true;
				break;
			default: 
				DoError(paramErr);
		}
	}
	while (!stop);
}

void DrawRLE16(int h,int v,int id)
{
	int rowBytes=gRowBytes;
	UInt8 *spritePos=GetSortedPackEntry(kPacksR16,id,nil)+sizeof(Rect);
	UInt8 *lineStart=gBaseAddr+h*2+v*rowBytes;
	UInt16 *dst=(UInt16*)lineStart;
	int stop=0;
	do
	{
		SInt32 tokenData = TOKEN_DATA(spritePos);
		switch (TOKEN_TYPE(spritePos))
		{
			case kDrawPixelsToken:
				{
					int i=0;
					UInt16 *src=(UInt16*)(spritePos+4);
					/* tokenData = number of UInt16 pixels; each is 2 bytes */
					int tokenSize=tokenData*2;
					/* Advance spritePos by 4 (header) + tokenSize bytes, padded to 4-byte boundary */
					spritePos+=4+tokenSize+(tokenSize&3?(4-(tokenSize&3)):0);
					/* Copy tokenData UInt16 pixels using 4-byte (2-pixel) chunks */
					while(tokenData-2>=i)
					{
						*((uint32_t*)(dst+i))=*((uint32_t*)(src+i));
						i+=2;
					}
					if(tokenData-1>=i)
						dst[i]=src[i];
					dst+=tokenData;
				}
				break;
			case kSkipPixelsToken:
				dst+=tokenData;
				spritePos+=4;
				break;
			case kLineStartToken:
				lineStart+=rowBytes;
				dst=(UInt16*)lineStart;
				spritePos+=4;
				break;
			case kEndShapeToken:
				stop=true;
				break;
			default: 
				DoError(paramErr);
		}
	}
	while (!stop);
}

void DrawRLEYClip8(int h,int v,int id)
{
	int rowBytes=gRowBytes;
	UInt8 *spritePos=GetSortedPackEntry(kPacksRLE,id,nil)+sizeof(Rect);
	UInt8 *lineStart=gBaseAddr+h+v*rowBytes;
	UInt8 *dst=lineStart;
	int stop=0;
	do
	{
		SInt32 tokenData = TOKEN_DATA(spritePos);
		switch (TOKEN_TYPE(spritePos))
		{
			case kDrawPixelsToken:
				{
					int i=0;
					UInt8 *src=spritePos+4;
					spritePos+=4+tokenData+(tokenData&3?(4-(tokenData&3)):0);
					if(v>=0)
					{
						while(tokenData-(int)sizeof(uint32_t)>=i)
						{
							*((uint32_t*)(dst+i))=*((uint32_t*)(src+i));
							i+=sizeof(uint32_t);
						}
						if(tokenData-(int)sizeof(uint16_t)>=i)
						{
							*((uint16_t*)(dst+i))=*((uint16_t*)(src+i));
							i+=sizeof(uint16_t);
						}
						if(tokenData-(int)sizeof(uint8_t)>=i)
							*((uint8_t*)(dst+i))=*((uint8_t*)(src+i));
					}
					dst+=tokenData;
				}
				break;
			case kSkipPixelsToken:
				dst+=tokenData;
				spritePos+=4;
				break;
			case kLineStartToken:
				lineStart+=rowBytes;
				dst=lineStart;
				spritePos+=4;
				v++;
				if(v>=gYSize)return;
				break;
			case kEndShapeToken:
				stop=true;
				break;
			default: 
				DoError(paramErr);
		}
	}
	while (!stop);
}

void DrawRLEYClip16(int h,int v,int id)
{
	int rowBytes=gRowBytes;
	UInt8 *spritePos=GetSortedPackEntry(kPacksR16,id,nil)+sizeof(Rect);
	UInt8 *lineStart=gBaseAddr+h*2+v*rowBytes;
	UInt16 *dst=(UInt16*)lineStart;
	int stop=0;
	do
	{
		SInt32 tokenData = TOKEN_DATA(spritePos);
		switch (TOKEN_TYPE(spritePos))
		{
			case kDrawPixelsToken:
				{
					int i=0;
					UInt16 *src=(UInt16*)(spritePos+4);
					int tokenSize=tokenData*2;
					spritePos+=4+tokenSize+(tokenSize&3?(4-(tokenSize&3)):0);
					if(v>=0)
					{
						while(tokenData-2>=i)
						{
							*((uint32_t*)(dst+i))=*((uint32_t*)(src+i));
							i+=2;
						}
						if(tokenData-1>=i)
							dst[i]=src[i];
					}
					dst+=tokenData;
				}
				break;
			case kSkipPixelsToken:
				dst+=tokenData;
				spritePos+=4;
				break;
			case kLineStartToken:
				lineStart+=rowBytes;
				dst=(UInt16*)lineStart;
				spritePos+=4;
				v++;
				if(v>=gYSize)return;
				break;
			case kEndShapeToken:
				stop=true;
				break;
			default: 
				DoError(paramErr);
		}
	}
	while (!stop);
}

void DrawRLE(int h,int v,int id)
{
	if(gPrefs.hiColor)
		 DrawRLE16(h,v,id);
	else
		 DrawRLE8(h,v,id);
}

void DrawRLEYClip(int h,int v,int id)
{
	if(gPrefs.hiColor)
		 DrawRLEYClip16(h,v,id);
	else
		 DrawRLEYClip8(h,v,id);
}
