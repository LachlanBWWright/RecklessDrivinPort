#include "gameframe.h"
#include "gameinitexit.h"
#include "lzrwHandleInterface.h"
#include "error.h"
#include "screen.h"
#include "input.h"
#include "gamesounds.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

#define kScrollSpeed	35	//pixels per second

int KeyPress()
{
	int pressed=false;
	KeyMap theKeys;
	GetKeys(theKeys);
	pressed=theKeys[0]|theKeys[1]|theKeys[2]|theKeys[3]|Button();
	return pressed;
}

void GameEndSequence()
{
	int yScroll;
	int picWidth;
	int picHeight;
	int savedGameOn;
	Pattern black;
	GWorldPtr textGW;
	GWorldPtr screenGW;
	GWorldPtr oldGW;
	GDHandle oldGD;
	UInt64 startMS;
	PicHandle pic=(PicHandle)GetResource('PPic',1009);
	Rect picSize,picBounds,draw;
	PauseFrameCount();
	BeQuiet();
	FadeScreen(1);
	savedGameOn=gGameOn;
	gGameOn=false;
	ScreenMode(kScreenRunning);
	screenGW=GetScreenGW();
 	LZRWDecodeHandle(&pic);
 	GetQDGlobalsBlack(&black);
 	picSize=(**pic).picFrame;
	SwapRect(&picSize);
	picWidth=picSize.right-picSize.left;
	picHeight=picSize.bottom-picSize.top;
	SetRect(&picBounds,0,0,picWidth,picHeight);
	GetGWorld(&oldGW,&oldGD);
	DoError(NewGWorld(&textGW,8,&picBounds,nil,nil,0));
	SetGWorld(textGW,nil);
	FillRect(&picBounds,&black);
	DrawPicture((PicHandle)pic,&picBounds);
	DisposeHandle(pic);		
	SetGWorld(screenGW,nil);
	SetRect(&draw,0,0,640,480);
	FillRect(&draw,&black);
	Blit2Screen();
	startMS=GetMSTime();
	for(yScroll=0;yScroll<picHeight+480&&!KeyPress();yScroll+=1)
	{
		float time=(GetMSTime()-startMS)/(float)1000000;
		if(yScroll>=time*kScrollSpeed)
		{
			SetRect(&draw,320-picWidth/2,480-yScroll,320+picWidth/2,480+picHeight-yScroll);
			CopyBits(GetPortBitMapForCopyBits(textGW),GetPortBitMapForCopyBits(screenGW),&picBounds,&draw,srcCopy,nil);	
			Blit2Screen();
			while(yScroll>=time*kScrollSpeed)time=(GetMSTime()-startMS)/(float)1000000;
		}
	#ifdef __EMSCRIPTEN__
		emscripten_sleep(1);
	#endif
	}
	SetRect(&draw,0,0,640,480);
	FillRect(&draw,&black);
	Blit2Screen();
	SetGWorld(oldGW,oldGD);
	DisposeGWorld(textGW);
	gGameOn=savedGameOn;
	if(gGameOn)
		ScreenMode(kScreenRunning);
	FadeScreen(1);
	FadeScreen(512);
	FlushInput();
	ResumeFrameCount();
}