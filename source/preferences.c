#include "error.h"
#include "input.h"
#include "preferences.h"
#include "interface.h"
#include "gamesounds.h"
#include "packs.h"
#include "screen.h"
#include "sprites.h"
#include "byteswap_packs.h"

enum{
	kOKButton=1,
	kCancelButton,
	kTitle,
	kControlsBox,
	kGraphicsBox,
	kSoundBox,
	kControlConfButton,
	kLineSkipCBox,
	kMotionBlurCBox,
	kVolumeTitle,
	kVolumeSlider,
	kEngineSoundCBox,
	kHQSoundCBox,
	kHiColorCBox
};

tPrefs gPrefs;
extern int gOSX;

static void prefs_set_pascal_string(unsigned char *dst, size_t capacity, const char *src)
{
	size_t len;
	if(capacity==0)
		return;
	memset(dst,0,capacity);
	if(!src)
		return;
	len=strlen(src);
	if(len>capacity-1)
		len=capacity-1;
	dst[0]=(unsigned char)len;
	if(len>0)
		memcpy(dst+1,src,len);
}

static void prefs_swap_high_scores(void)
{
	int i;
	for(i=0;i<kNumHighScoreEntrys;i++)
	{
		gPrefs.high[i].time=(UInt32)be32_swap((uint32_t)gPrefs.high[i].time);
		gPrefs.high[i].score=(UInt32)be32_swap((uint32_t)gPrefs.high[i].score);
	}
}

static void prefs_seed_placeholder_high_scores(void)
{
	static const char *kDefaultNames[kNumHighScoreEntrys]={
		"ACE",
		"BEE",
		"CAM",
		"DOT",
		"EEL",
		"FOX",
		"GAS",
		"HEX",
		"ION",
		"JET"
	};
	int i;
	for(i=0;i<kNumHighScoreEntrys;i++)
	{
		prefs_set_pascal_string((unsigned char *)gPrefs.high[i].name,sizeof(gPrefs.high[i].name),kDefaultNames[i]);
		gPrefs.high[i].score=(UInt32)((kNumHighScoreEntrys-i)*1000);
		gPrefs.high[i].time=0;
	}
	prefs_set_pascal_string((unsigned char *)gPrefs.lastName,sizeof(gPrefs.lastName),"PLAYER");
}

static void prefs_ensure_high_scores_visible(void)
{
	int i;
	for(i=0;i<kNumHighScoreEntrys;i++)
		if(gPrefs.high[i].name[0]!=0||gPrefs.high[i].score!=0)
			return;
	prefs_seed_placeholder_high_scores();
}

short GetPrefsFile(FSSpec *spec)
{
	return 0;
}

void ReInitGraphics()
{
	DisposeInterface();
	ScreenMode(kScreenStopped);
	InitScreen(0);
	ShowPicScreen(1003);	
	UnloadPack(kPacksR16);
	UnloadPack(kPackcR16);
	UnloadPack(kPackTx16);
	UnloadPack(kPacksRLE);
	UnloadPack(kPackcRLE);
	UnloadPack(kPackTxtR);
	UnloadSprites();
	if(gPrefs.hiColor)
	{
		LoadPack(kPacksR16);
		PortByteSwapPackRLE16(kPacksR16);
		LoadPack(kPackcR16);
		PortByteSwapPackRLE16(kPackcR16);
		LoadPack(kPackTx16);
		PortByteSwapPackTx16();
	}
	else
	{
		LoadPack(kPacksRLE);
		LoadPack(kPackcRLE);
		LoadPack(kPackTxtR);
	}
	LoadSprites();
	InitInterface();
	ScreenUpdate(nil);
}

void FirstRun()
{
	Handle prefDefault;
	SInt32 cpuSpeed;
	OSErr err;
	err=Gestalt(gestaltProcClkSpeed,&cpuSpeed);
	if(((UInt32)cpuSpeed<120000000)||err)
		prefDefault=GetResource('Pref',128);
	else if((UInt32)cpuSpeed<250000000)
		prefDefault=GetResource('Pref',129);
	else prefDefault=GetResource('Pref',130);

	if(!prefDefault) {
		/* Default preferences for port - fallback when 'Pref' resource is unavailable */
		memset(&gPrefs, 0, sizeof(tPrefs));
		gPrefs.version = kPrefsVersion;
		gPrefs.volume  = 256;
		gPrefs.sound   = 1;
		gPrefs.engineSound = 1;
		gPrefs.hqSound = 0;
		gPrefs.lineSkip = 0;
		gPrefs.motionBlur = 0;
		gPrefs.hiColor = 1;
		/* Default keyboard bindings: arrow keys + space/shift/z/x/esc */
		gPrefs.keyCodes[kForward]   = 0x7E; /* Up arrow */
		gPrefs.keyCodes[kBackward]  = 0x7D; /* Down arrow */
		gPrefs.keyCodes[kLeft]      = 0x7B; /* Left arrow */
		gPrefs.keyCodes[kRight]     = 0x7C; /* Right arrow */
		gPrefs.keyCodes[kKickdown]  = 0x38; /* Shift */
		gPrefs.keyCodes[kBrake]     = 0x31; /* Space */
		gPrefs.keyCodes[kFire]      = 0x06; /* Z */
		gPrefs.keyCodes[kMissile]   = 0x07; /* X */
		gPrefs.keyCodes[kAbort]     = 0x35; /* Escape */
		gPrefs.keyCodes[kPause]     = 0x0F; /* R */
		prefs_ensure_high_scores_visible();
		return;
	}
	{
		long copySize = GetHandleSize(prefDefault);
		if (copySize > (long)sizeof(tPrefs)) copySize = (long)sizeof(tPrefs);
		BlockMoveData(*prefDefault,&gPrefs,copySize);
		/* The Pref resource contains big-endian Mac values.
		 * Byte-swap the multi-byte fields on little-endian platforms. */
		gPrefs.version = (UInt16)be16_swap((uint16_t)gPrefs.version);
		gPrefs.volume  = (UInt16)be16_swap((uint16_t)gPrefs.volume);
		prefs_swap_high_scores();
		/* Clamp volume to a reasonable range */
		if(gPrefs.volume > 256) gPrefs.volume = 100;
	}
	ReleaseResource(prefDefault);
#ifdef PORT_SDL2
	/* The original Pref resource maps driving to the numeric keypad.
	 * Override with standard arrow-key + modifier bindings for the SDL2 port.
	 * The Pref resources also have sound disabled by default; enable it here. */
	gPrefs.sound       = 1;
	gPrefs.engineSound = 1;
	/* The port now byte-swaps 16-bit textures/sprites on load, so hi-color is
	 * safe on little-endian platforms. */
	gPrefs.hiColor     = 1;
	gPrefs.keyCodes[kForward]   = 0x7E; /* Up arrow */
	gPrefs.keyCodes[kBackward]  = 0x7D; /* Down arrow */
	gPrefs.keyCodes[kLeft]      = 0x7B; /* Left arrow */
	gPrefs.keyCodes[kRight]     = 0x7C; /* Right arrow */
	gPrefs.keyCodes[kKickdown]  = 0x38; /* Left Shift */
	gPrefs.keyCodes[kBrake]     = 0x31; /* Space */
	gPrefs.keyCodes[kFire]      = 0x06; /* Z */
	gPrefs.keyCodes[kMissile]   = 0x07; /* X */
	gPrefs.keyCodes[kAbort]     = 0x35; /* Escape */
	gPrefs.keyCodes[kPause]     = 0x0F; /* R */
#endif
	prefs_ensure_high_scores_visible();
}

void LoadPrefs()
{
	FirstRun();
}

void WritePrefs(int reset)
{
}

void DeactivateSubControls(ControlHandle cnt)
{
	UInt16 i,max;
	DoError(CountSubControls(cnt,&max));
	for(i=1;i<=max;i++)
	{
		ControlHandle subCnt;
		DoError(GetIndexedSubControl(cnt,i,&subCnt));
		DoError(DeactivateControl(subCnt));
	}
}

void ActivateSubControls(ControlHandle cnt)
{
	UInt16 i,max;
	DoError(CountSubControls(cnt,&max));
	for(i=1;i<=max;i++)
	{
		ControlHandle subCnt;
		DoError(GetIndexedSubControl(cnt,i,&subCnt));
		DoError(ActivateControl(subCnt));
	}
}

void Preferences()
{	
	DialogPtr prefDlg;
	short hit;
	int modeSwitch=false;
	UInt8 soundOn=gPrefs.sound;
	ControlHandle cnt;
	FadeScreen(1);
	ScreenMode(kScreenSuspended);
	FadeScreen(0);
	prefDlg=GetNewDialog(128,nil,(WindowPtr)-1L);
	DoError(SetDialogDefaultItem(prefDlg,kOKButton));
	DoError(SetDialogCancelItem(prefDlg,kCancelButton));
	DoError(GetDialogItemAsControl(prefDlg,kLineSkipCBox,&cnt));
	SetControlValue(cnt,gPrefs.lineSkip);
	if(gOSX)
		DoError(DeactivateControl(cnt));
	DoError(GetDialogItemAsControl(prefDlg,kMotionBlurCBox,&cnt));
	SetControlValue(cnt,gPrefs.motionBlur);
	DoError(GetDialogItemAsControl(prefDlg,kEngineSoundCBox,&cnt));
	SetControlValue(cnt,gPrefs.engineSound);
	DoError(GetDialogItemAsControl(prefDlg,kHQSoundCBox,&cnt));
	SetControlValue(cnt,gPrefs.hqSound);
	DoError(GetDialogItemAsControl(prefDlg,kVolumeSlider,&cnt));
	SetControlValue(cnt,gPrefs.volume);
	DoError(GetDialogItemAsControl(prefDlg,kHiColorCBox,&cnt));
	SetControlValue(cnt,gPrefs.hiColor);
	DoError(GetDialogItemAsControl(prefDlg,kSoundBox,&cnt));
	SetControlValue(cnt,gPrefs.sound);
	if(!gPrefs.sound) DeactivateSubControls(cnt);
	gPrefs.sound=true;
	do{
		short type;
		Rect box;
		Handle item;
		ModalDialog(nil,&hit);
		GetDialogItem(prefDlg,hit,&type,&item,&box);
		if(hit==kSoundBox)
			if(!GetControlValue((ControlHandle)item))
				ActivateSubControls((ControlHandle)item);
			else
				DeactivateSubControls((ControlHandle)item);
		if(type==chkCtrl+ctrlItem||hit==kSoundBox)
			SetControlValue((ControlHandle)item,!GetControlValue((ControlHandle)item));	
		if(hit==kControlConfButton)
		{
			HideWindow(prefDlg);
			ConfigureInput();
			ShowWindow(prefDlg);
			SelectWindow(prefDlg);
		}
		if(hit==kVolumeSlider)
		{
			int hq=gPrefs.hqSound;
			gPrefs.hqSound=false;
			DoError(GetDialogItemAsControl(prefDlg,kVolumeSlider,&cnt));
			SetGameVolume(GetControlValue(cnt));
			SimplePlaySound(129);
			gPrefs.hqSound=hq;
		}
	}while(hit!=kOKButton&&hit!=kCancelButton);
	if(hit==kOKButton)
	{
		DoError(GetDialogItemAsControl(prefDlg,kLineSkipCBox,&cnt));
		gPrefs.lineSkip=GetControlValue(cnt);
		DoError(GetDialogItemAsControl(prefDlg,kMotionBlurCBox,&cnt));
		gPrefs.motionBlur=GetControlValue(cnt);
		DoError(GetDialogItemAsControl(prefDlg,kEngineSoundCBox,&cnt));
		gPrefs.engineSound=GetControlValue(cnt);
		DoError(GetDialogItemAsControl(prefDlg,kHQSoundCBox,&cnt));
		gPrefs.hqSound=GetControlValue(cnt);
		DoError(GetDialogItemAsControl(prefDlg,kVolumeSlider,&cnt));
		gPrefs.volume=GetControlValue(cnt);
		DoError(GetDialogItemAsControl(prefDlg,kSoundBox,&cnt));
		gPrefs.sound=GetControlValue(cnt);
		DoError(GetDialogItemAsControl(prefDlg,kHiColorCBox,&cnt));
		if(gPrefs.hiColor!=GetControlValue(cnt))
			modeSwitch=true;
		gPrefs.hiColor=GetControlValue(cnt);
		WritePrefs(false);
		InitChannels();
	}
	else gPrefs.sound=soundOn;
	SetGameVolume(-1);
	DisposeDialog(prefDlg);
	if(modeSwitch)
		ReInitGraphics();
	FadeScreen(1);
	ScreenMode(kScreenRunning);
	ScreenUpdate(nil);
	FadeScreen(0);
}
