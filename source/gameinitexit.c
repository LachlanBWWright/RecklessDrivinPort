#include "input.h"
#include "screen.h"
#include "gameframe.h"
#include "gameinitexit.h"
#include "roads.h"
#include "objects.h"
#include "error.h"
#include "trig.h"
#include "gamesounds.h"
#include "renderframe.h"
#include "interface.h"
#include "screenfx.h"
#include "textfx.h"
#include "sprites.h"
#include "packs.h"
#include "high.h"
#include "register.h"
#include "preferences.h"
#include "gamesounds.h"
#include "byteswap_packs.h"
#include <string.h>
#ifdef PORT_SDL2
#include <SDL.h>
#endif
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

tRoad gRoadData;	
UInt32 *gRoadLenght;
tRoadInfo *gRoadInfo;
tLevelData *gLevelData;
tTrackInfo *gTrackUp,*gTrackDown;
tMarkSeg *gMarks;
int gMarkSize;
int gLevelID;
tObject *gFirstObj,*gCameraObj,*gPlayerObj,*gSpikeObj,*gBrakeObj,*gFirstVisObj,*gLastVisObj;
tTrackSeg gTracks[kMaxTracks];
int gTrackCount;
int gPlayerLives,gExtraLives;
int gNumMissiles,gNumMines;
float gPlayerDeathDelay,gFinishDelay;
int gPlayerScore,gDisplayScore;
int gPlayerBonus;
UInt32 gPlayerAddOns;
float gGameTime;
float gXDriftPos,gYDriftPos,gXFrontDriftPos,gYFrontDriftPos,gZoomVelo;
int gGameOn;
int gPlayerCarID;
float gPlayerSlide[4]={0,0,0,0};
float gSpikeFrame;
int gLCheat;
tEditorLaunchOptions gEditorLaunchOptions={0,0,0,0,0,0,0,0};

static int ClampEditorLaunchStartY(int startY,int levelEnd)
{
	if(startY<0)
		return 0;
	if(startY>levelEnd)
		return levelEnd;
	return startY;
}

void ResetEditorLaunchOptions(void)
{
	memset(&gEditorLaunchOptions,0,sizeof(gEditorLaunchOptions));
}

void SetEditorLaunchOptions(const tEditorLaunchOptions *options)
{
	if(!options)
	{
		ResetEditorLaunchOptions();
		return;
	}
	gEditorLaunchOptions=*options;
	gEditorLaunchOptions.enabled=options->enabled?true:false;
	gEditorLaunchOptions.hasStartY=options->hasStartY?true:false;
	gEditorLaunchOptions.hasObjectGroupStartY=options->hasObjectGroupStartY?true:false;
}

void rd_set_editor_launch_options(int levelID,int hasStartY,int startY,
	int hasObjectGroupStartY,int objectGroupStartY,
	UInt32 forcedAddOns,UInt32 disabledBonusRollMask)
{
	tEditorLaunchOptions options={
		true,
		levelID,
		hasStartY,
		startY,
		hasObjectGroupStartY,
		objectGroupStartY,
		forcedAddOns,
		disabledBonusRollMask
	};
	SetEditorLaunchOptions(&options);
}

int abs(int x);
void CopClear();

Ptr LoadObjs(Ptr dataPos)
{
	int i;
	tObjectPos *objs=(tObjectPos*)(dataPos+sizeof(UInt32));
	for(i=0;i<*(UInt32*)dataPos;i++)
	{
		tObject *theObj=NewObject(gFirstObj,objs[i].typeRes);
		theObj->dir=objs[i].dir;
		theObj->pos.x=objs[i].x;
		theObj->pos.y=objs[i].y;		
	}
	return (Ptr)(objs+*(UInt32*)dataPos);
}

int NumLevels()
{	
	int i=kPackLevel1;
	SetResLoad(false);
	for(i=140;Get1Resource('Pack',i);i++);
	SetResLoad(true);
	if(i==140)i=150;
	return i-140;
}

void GameEndSequence();

int LoadLevel()
{
	int i,sound;
	int playerStartY=500;
	LOG_DEBUG("LOG: LoadLevel called – gLevelID=%d\n", gLevelID);
#ifdef __EMSCRIPTEN__
	EM_ASM_INT({ console.log('[WASM] LoadLevel: level ' + $0); }, gLevelID);
#endif
	if(gLevelID>=kEncryptedPack-kPackLevel1||gLevelResFile)
		if(!gRegistered)
		{
			ShowPicScreen(1005);
			WaitForPress();
			BeQuiet();
			InitInterface();
			ShowCursor();
			if(!gLCheat)
				CheckHighScore(gPlayerScore);
			return false;
		}

	gFirstObj=(tObject*)NewPtrClear(sizeof(tObject));
	gFirstObj->next=gFirstObj;
	gFirstObj->prev=gFirstObj;
	
	if(gLevelID>=NumLevels())
	{
		GameEndSequence();
		gLevelID=0;
	}

	LoadPack(kPackLevel1+gLevelID);
	PortByteSwapLevelPack(kPackLevel1+gLevelID);
	gLevelData=(tLevelData*)GetSortedPackEntry(kPackLevel1+gLevelID,1,nil);
	gMarks=(tMarkSeg*)GetSortedPackEntry(kPackLevel1+gLevelID,2,&gMarkSize);
	gMarkSize/=sizeof(tMarkSeg);
	gRoadInfo=(tRoadInfo*)GetSortedPackEntry(kPackRoad,gLevelData->roadInfo,nil);
	gTrackUp=(tTrackInfo*)((Ptr)gLevelData+sizeof(tLevelData));
	gTrackDown=(tTrackInfo*)((Ptr)gTrackUp+sizeof(UInt32)+gTrackUp->num*sizeof(tTrackInfoSeg));
	gRoadLenght=(UInt32*)LoadObjs((Ptr)gTrackDown+sizeof(UInt32)+gTrackDown->num*sizeof(tTrackInfoSeg));
	gRoadData=(tRoad)((Ptr)gRoadLenght+sizeof(UInt32));

	for(i=0;i<10;i++)
		if((*gLevelData).objGrps[i].resID)
			InsertObjectGroup((*gLevelData).objGrps[i]);
	if(gEditorLaunchOptions.enabled&&gEditorLaunchOptions.hasStartY)
		playerStartY=ClampEditorLaunchStartY(gEditorLaunchOptions.startY,gLevelData->levelEnd);

	gPlayerObj=NewObject(gFirstObj,gRoadInfo->water?kNormalPlayerBoatID:gPlayerCarID);
	gPlayerObj->pos.x=gLevelData->xStartPos;
	gPlayerObj->pos.y=playerStartY;
	gPlayerObj->control=kObjectDriveUp;
	if(gTrackUp->num)
	{
		gPlayerObj->target=1;
		while((gPlayerObj->target<gTrackUp->num)&&
			(gTrackUp->track[gPlayerObj->target].y<gPlayerObj->pos.y))
			gPlayerObj->target++;
	}
	else
		gPlayerObj->target=0;
	gCameraObj=gPlayerObj;
	gPlayerBonus=1;
//	gPlayerObj=nil; //	Uncomment this line to make the player car ai controlled
	gSpikeObj=nil;
	gBrakeObj=nil;
	CopClear();
	SortObjects();
	
	gGameTime=0;
	gTrackCount=0;
	gPlayerDeathDelay=0;
	gFinishDelay=0;
	gPlayerBonus=1;
	gDisplayScore=gPlayerScore;
	gXDriftPos=0;
	gYDriftPos=0;
	gXFrontDriftPos=0;
	gYFrontDriftPos=0;
	gZoomVelo=kMaxZoomVelo;
	ClearTextFX();
	StartCarChannels();
	gScreenBlitSpecial=true;
	return true;
}

void DisposeLevel()
{
	UnloadPack(kPackLevel1+gLevelID);
	gPlayerObj=nil;
	while((tObject*)gFirstObj->next!=gFirstObj)
	{
		SpriteUnused((*(tObject*)gFirstObj->next).frame);
		RemoveObject((tObject*)gFirstObj->next);
	}
	DisposePtr((Ptr)gFirstObj);
}

extern int gOSX;

void GetLevelNumber()
{
	DialogPtr cheatDlg;
	short type;
	Rect box;
	Handle item;
	short hit;
	long num;
	Str255 text;
	if(gOSX)
	{
		FadeScreen(1);
		ScreenMode(kScreenSuspended);
		FadeScreen(0);
	}
	cheatDlg=GetNewDialog(129,nil,(WindowPtr)-1);
	DoError(SetDialogDefaultItem(cheatDlg,1));
	do ModalDialog(nil,&hit); while(hit!=1);
	GetDialogItem(cheatDlg,2,&type,&item,&box);
	GetDialogItemText(item,text);
	StringToNum(text,&num);
	gLevelID=num-1;
	if(gLevelID>=NumLevels())gLevelID=0;
	GetDialogItem(cheatDlg,5,&type,&item,&box);
	GetDialogItemText(item,text);
	StringToNum(text,&num);
	gPlayerCarID=num;
	DisposeDialog(cheatDlg);
	if(gOSX)
	{
		FadeScreen(1);
		ScreenMode(kScreenRunning);
		FadeScreen(512);
	}
}

void StartGame(int lcheat)
{
	int editorLaunchActive=gEditorLaunchOptions.enabled;
	tEditorLaunchOptions launchOptions=gEditorLaunchOptions;
	LOG_DEBUG("LOG: StartGame called (lcheat=%d)\n", lcheat);
#ifdef __EMSCRIPTEN__
	EM_ASM({ console.log('[WASM] StartGame called - loading level...'); });
#endif
	if(editorLaunchActive)
	{
		int numLevels=NumLevels();
		if(launchOptions.levelID<0||launchOptions.levelID>=numLevels)
		{
			LOG_DEBUG("LOG: Editor test drive launch ignored due to invalid level (%d)\n",launchOptions.levelID+1);
			ResetEditorLaunchOptions();
			return;
		}
		LOG_DEBUG("LOG: Editor test drive options level=%d hasStartY=%d startY=%d hasObjectGroupStartY=%d objectGroupStartY=%d forcedAddOns=0x%08x disabledBonusRollMask=0x%08x\n",
			launchOptions.levelID+1,
			launchOptions.hasStartY,
			launchOptions.startY,
			launchOptions.hasObjectGroupStartY,
			launchOptions.objectGroupStartY,
			(unsigned int)launchOptions.forcedAddOns,
			(unsigned int)launchOptions.disabledBonusRollMask);
#ifdef __EMSCRIPTEN__
		EM_ASM({
			console.log('[WASM] Editor test drive options level=' + ($0 + 1) +
				' hasStartY=' + $1 +
				' startY=' + $2 +
				' hasObjectGroupStartY=' + $3 +
				' objectGroupStartY=' + $4 +
				' forcedAddOns=0x' + ($5 >>> 0).toString(16) +
				' disabledBonusRollMask=0x' + ($6 >>> 0).toString(16));
		},
		launchOptions.levelID,
		launchOptions.hasStartY,
		launchOptions.startY,
		launchOptions.hasObjectGroupStartY,
		launchOptions.objectGroupStartY,
		launchOptions.forcedAddOns,
		launchOptions.disabledBonusRollMask);
#endif
	}
	DisposeInterface();
	gPlayerLives=3;
	gExtraLives=0;
	gPlayerAddOns=editorLaunchActive?launchOptions.forcedAddOns:0;
	gPlayerDeathDelay=0;
	gFinishDelay=0;
	gPlayerScore=0;
	gLevelID=editorLaunchActive?launchOptions.levelID:0;
	gPlayerCarID=kNormalPlayerCarID;
	gNumMissiles=0;
	gNumMines=0;
	gGameOn=true;
	gEndGame=false;
#ifdef PORT_SDL2
	if(!editorLaunchActive)
	{
		/* Level-skip cheat: hold a number key (0-9) when clicking Start */
		const Uint8 *keys = SDL_GetKeyboardState(NULL);
		int i;
		for(i=1;i<=9;i++)
			if(keys[SDL_SCANCODE_1+i-1])
			{
				gLevelID=i-1;
				if(gLevelID>=NumLevels())gLevelID=0;
				lcheat=1;
				LOG_DEBUG("LOG: Level skip cheat – starting at level %d\n",gLevelID+1);
				break;
			}
		if(!lcheat&&keys[SDL_SCANCODE_0])
		{
			gLevelID=9;
			if(gLevelID>=NumLevels())gLevelID=0;
			lcheat=1;
			LOG_DEBUG("LOG: Level skip cheat – starting at level %d\n",gLevelID+1);
		}
	}
	else
	{
		lcheat=1;
		LOG_DEBUG("LOG: Editor test drive launch – starting at level %d\n",gLevelID+1);
	}
#else
	if(editorLaunchActive)
	{
		lcheat=1;
	}
	else if(lcheat)
		GetLevelNumber();
#endif
	gLCheat=lcheat;
	FadeScreen(1);
	HideCursor();
	ScreenMode(kScreenRunning);
	InputMode(kInputRunning);
	if(LoadLevel()){
		ScreenClear();
		FadeScreen(512);	
		RenderFrame();
		InitFrameCount();
	}
}

void rd_start_editor_test_drive(void)
{
	if(gGameOn||!gEditorLaunchOptions.enabled)
		return;
	StartGame(1);
}

void EndGame()
{	
	ResetEditorLaunchOptions();
	gPlayerLives=0;//so RenderFrame will not draw Panel.
	RenderFrame();
	DisposeLevel();
	BeQuiet();
	SimplePlaySound(152);
	GameOverAnim();		
	InitInterface();
	ShowCursor();
	if(!gLCheat)
		CheckHighScore(gPlayerScore);
}
