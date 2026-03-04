#ifndef PORT_SDL2
#define CALL_IN_SPOCKETS_BUT_NOT_IN_CARBON 1
#include <InputSprocket.h>
#include <DriverServices.h>
#include <iShockXForceAPI.h>
#include <HID_Utilities_CFM.h>
#define kCreator 0x52000002u  /* Mac creator code */
#endif /* !PORT_SDL2 */
#ifdef PORT_SDL2
#include <SDL2/SDL.h>
#endif
#include <math.h>
#include "error.h"
#include "input.h"
#include "interface.h"
#include "objects.h"
#include "screen.h"
#include "gameframe.h"
#include "preferences.h"

#define kMinSwitchDelay		15		//Minimum Delay between siwtching reverse gears in frames.

#ifndef PORT_SDL2
ISpElementReference *gVirtualElements;
ISpElementListReference gEventElements;
#endif
tInputData gInputData;
int gFire,gMissile;
int gInputISp=false;
int gInputHID=false;
int gForceFeedback=false;
unsigned long gSwitchDelayStart;
int gLastScan[kNumElements];
#ifndef PORT_SDL2
iS2F_DeviceRef_t giShockList[iS2F_MAX_ISHOCK2_NUM];
pRecElement *gElements;
pRecDevice gController;
int gNumHIDElements=0;
extern int gOSX;
#endif

int gFFBBlock=0;
void FFBJolt(float lMag,float rMag,float duration)
{
#ifndef PORT_SDL2
	if(gForceFeedback)
	{
		iS2F_JoltCmd_t joltCmd;
		joltCmd.motorCmd.leftMotorMagnitude=lMag*10;
		joltCmd.motorCmd.rightMotorMagnitude=rMag*10;
		joltCmd.duration=duration*1000;
		iS2F_SimpleJolt(giShockList[0],&joltCmd);
		gFFBBlock=gFrameCount+duration*kCalcFPS;
	}
#else
	(void)lMag; (void)rMag; (void)duration;
#endif
}

void FFBDirect(float lMag,float rMag)
{
#ifndef PORT_SDL2
	if(gForceFeedback&&gFrameCount>gFFBBlock)
	{
		iS2F_MotorCmd_t directCmd;
		directCmd.leftMotorMagnitude=lMag*10;
		directCmd.rightMotorMagnitude=rMag*10;
		iS2F_SimpleDirectControl(giShockList[0],&directCmd);
	}
#else
	(void)lMag; (void)rMag;
#endif
}

void FFBStop()
{
#ifndef PORT_SDL2
	if(gForceFeedback)
	{
		iS2F_MotorCmd_t directCmd;
		directCmd.leftMotorMagnitude=0;
		directCmd.rightMotorMagnitude=0;
		iS2F_SimpleDirectControl(giShockList[0],&directCmd);
	}
#endif
}

void InputMode(int mode)
{
#ifndef PORT_SDL2
	if(gInputISp)
	{
		switch(mode){
			case kInputRunning:
				DoError(ISpResume());
				DoError(ISpElementList_Flush(gEventElements));
				break;
			case kInputSuspended:
				DoError(ISpSuspend());break;
			case kInputStopped:
				DoError(ISpStop());break;
		}
	}
	else
#endif
	{
		int i;
		for(i=0;i<kNumElements;i++)
			gLastScan[i]=false;
	}
	if(mode==kInputStopped)
	{
#ifndef PORT_SDL2
		if(gForceFeedback)
		{
			FFBStop();
			iS2F_Final();
		}
		if(gInputHID)
		{
			HIDReleaseDeviceList();
			TearDownHIDCFM();
		}
#endif
	}
	if(mode==kInputSuspended&&gForceFeedback)
		FFBStop();
}

#ifndef PORT_SDL2
#define kHIDPage_GenericDesktop 0x1
#define kHIDUsage_GD_Mouse 0x2
#define kHIDUsage_GD_Keyboard 0x6

void InitHID()
{
	DoError(SetupHIDCFM());
	if(HIDBuildDeviceList(NULL,NULL))
	{
		int deviceOK;
		//init first HID device found
		gController=HIDGetFirstDevice();
		
		do{
			deviceOK=!(gController->usagePage!=kHIDPage_GenericDesktop||gController->usage==kHIDUsage_GD_Mouse||gController->usage==kHIDUsage_GD_Keyboard);
			if(!deviceOK)
				gController=HIDGetNextDevice(gController);
		}while(gController&&!deviceOK);
		
		if(gController)
		{	
			int j;
			gNumHIDElements=HIDCountDeviceElements(gController,kHIDElementTypeInput);
			gElements=(pRecElement*)NewPtr(sizeof(pRecElement)*gNumHIDElements);
			gElements[0]=HIDGetFirstDeviceElement(gController,kHIDElementTypeInput);
			for(j=1;j<gNumHIDElements;j++)
				gElements[j]=HIDGetNextDeviceElement(gElements[j-1],kHIDElementTypeInput);
			gInputHID=true;
		}
	}
	if(!gInputHID)
		TearDownHIDCFM();
}

UInt32 U32Version(NumVersion v);

void InitInput()
{
	if((Ptr)ISpGetVersion!=(Ptr)kUnresolvedCFragSymbolAddress)
	{
		if(U32Version(ISpGetVersion())>=0x0110) 
		gInputISp=true;
	}
	if(gInputISp)
	{
		ISpNeed** needs;
		int needCount;
		
		needs=(ISpNeed**)GetResource('ISpN',128);
		HLock((Handle)needs);
		needCount=GetHandleSize((Handle)needs)/sizeof(ISpNeed);
		gVirtualElements=(ISpElementReference*)NewPtr(sizeof(ISpElementReference)*needCount);
		DoError(ISpElement_NewVirtualFromNeeds(needCount, *needs, gVirtualElements, 0));
		DoError(ISpInit(needCount,*needs,gVirtualElements,kCreator,'????',0,128,0));
		//DoError(ISpDevices_ActivateClass(kISpDeviceClass_SpeechRecognition));
		//DoError(ISpDevices_ActivateClass(kISpDeviceClass_Mouse));
		DoError(ISpDevices_ActivateClass(kISpDeviceClass_Keyboard));	
		InputMode(kInputSuspended);
		DoError(ISpElementList_New(0,nil,&gEventElements,0));
		DoError(ISpElementList_AddElements(gEventElements,kForward,1,&gVirtualElements[kForward]));
		DoError(ISpElementList_AddElements(gEventElements,kBackward,1,&gVirtualElements[kBackward]));
		DoError(ISpElementList_AddElements(gEventElements,kLeft,1,&gVirtualElements[kLeft]));
		DoError(ISpElementList_AddElements(gEventElements,kRight,1,&gVirtualElements[kRight]));
		DoError(ISpElementList_AddElements(gEventElements,kAbort,1,&gVirtualElements[kAbort]));
		DoError(ISpElementList_AddElements(gEventElements,kMissile,1,&gVirtualElements[kMissile]));
		DoError(ISpElementList_AddElements(gEventElements,kFire,1,&gVirtualElements[kFire]));
		DoError(ISpElementList_AddElements(gEventElements,kPause,1,&gVirtualElements[kPause]));
		//DoError(ISpElementList_AddElements(gEventElements,kScreenshot,1,&gVirtualElements[kScreenshot]));
		ReleaseResource(GetResource('ISpN',128));
	}
	if(gOSX)
		InitHID();
	if(!iS2F_Init())
	{
		gForceFeedback=true;
		DoError(iS2F_GetDevRefList(giShockList));
	}

}
#endif /* !PORT_SDL2 */


float ThrottleReset(float throttle)
{
	if(throttle>0){
		throttle-=2*kFrameDuration;
		if(throttle<0)
			throttle=0;
	}else if(throttle<0){
		throttle+=2*kFrameDuration;
		if(throttle>0)
			throttle=0;							
	}
	return throttle;
}

void PauseGame();

short IsPressed(unsigned short k )
// k =  any keyboard scan code, 0-127
{
	unsigned char km[16];

	GetKeys( (long *) km);
	return ( ( km[k>>3] >> (k & 7) ) & 1);
}

int GetElement(int element)
{
#ifndef PORT_SDL2
	if(gInputISp)
	{
		UInt32 tempInput;
		ISpElement_GetSimpleState(gVirtualElements[element],&tempInput);
		return tempInput;
	}
	else
#endif
		if(IsPressed(gPrefs.keyCodes[element]))
			return true;
#ifdef PORT_SDL2
	/* Hardcoded SDL2 fallback: arrow keys and WASD always drive,
	 * independent of the keyCodes stored in preferences.
	 * (The original 'Pref' resource defaults to numpad keys, not arrows.) */
	{
		const Uint8 *sdl_keys = SDL_GetKeyboardState(NULL);
		switch(element)
		{
			case kForward:  if(sdl_keys[SDL_SCANCODE_UP]    || sdl_keys[SDL_SCANCODE_W]) return true; break;
			case kBackward: if(sdl_keys[SDL_SCANCODE_DOWN]  || sdl_keys[SDL_SCANCODE_S]) return true; break;
			case kLeft:     if(sdl_keys[SDL_SCANCODE_LEFT]  || sdl_keys[SDL_SCANCODE_A]) return true; break;
			case kRight:    if(sdl_keys[SDL_SCANCODE_RIGHT] || sdl_keys[SDL_SCANCODE_D]) return true; break;
			case kAbort:    if(sdl_keys[SDL_SCANCODE_ESCAPE]) return true; break;
			default: break;
		}
	}
#endif
#ifndef PORT_SDL2
	if(gInputHID&&element<=kMissile)
		if(gPrefs.hidElements[element]<gNumHIDElements)
			if(gElements[gPrefs.hidElements[element]]->type==2)
				if(HIDGetElementValue(gController,gElements[gPrefs.hidElements[element]]))
					return true;
#endif
	return false;
}

int GetElementHIDOnly(int element)
{
#ifndef PORT_SDL2
	if(gInputHID&&element<=kMissile)
		if(gPrefs.hidElements[element]<gNumHIDElements)
			if(gElements[gPrefs.hidElements[element]]->type==2)
				if(HIDGetElementValue(gController,gElements[gPrefs.hidElements[element]]))
					return true;
#endif
	return false;
}

int ContinuePress()
{
	if(gInputHID)
		if(GetElementHIDOnly(kForward)
			||GetElementHIDOnly(kKickdown)
			||GetElementHIDOnly(kFire)
			||GetElementHIDOnly(kMissile))
				return true;
	return false;
}

int GetEvent(int *element,int *data)
{
#ifndef PORT_SDL2
	if(gInputISp)
	{
		Boolean wasEvent;
		ISpElementEvent event;
		DoError(ISpElementList_GetNextEvent(gEventElements,sizeof(ISpElementEvent),&event,&wasEvent));
		if(wasEvent){
			*element=event.refCon;
			*data=event.data;
			return true;
		}
		else return false;
	}
	else
#endif
	{
		int i;
		for(i=0;i<kNumElements;i++)
		{
			int scan=GetElement(i);
			if(scan!=gLastScan[i])
			{
				*element=i;
				*data=scan;
				gLastScan[i]=scan;
				return true;
			}
		}
		return false;
	}
}

void Input(tInputData **data)
{
	int playerVelo=VEC2D_DotProduct(gPlayerObj->velo,P2D(sin(gPlayerObj->dir),cos(gPlayerObj->dir)));
	int axState=0;	
	int switchRequest=false;
	int element,eventData;
	gMissile=false;
	gFire=false;
	if(playerVelo)
		gSwitchDelayStart=gFrameCount;
	gInputData.handbrake=(GetElement(kBrake)?gInputData.handbrake+kFrameDuration*8:0);
	if(gInputData.handbrake>1)gInputData.handbrake=1;
	gInputData.kickdown=false;
	if(GetElement(kForward))axState=1;
	if(GetElement(kBackward))axState=-1;
	switch(axState)
	{
		case 1:if(!gInputData.reverse){	
					gInputData.throttle+=3*kFrameDuration;
					if(gInputData.throttle>1)gInputData.throttle=1;
					gInputData.brake=0;
					if(playerVelo<0)
					{
						switchRequest=true;
						gSwitchDelayStart=gFrameCount-kMinSwitchDelay;
					}					
				}
				else{
					gInputData.brake+=kFrameDuration*6;
					if(gInputData.brake>1)gInputData.brake=1;
					gInputData.throttle=ThrottleReset(gInputData.throttle);
					if(!playerVelo)
						switchRequest=true;
					if(playerVelo>0)
					{
						switchRequest=true;
						gSwitchDelayStart=gFrameCount-kMinSwitchDelay;
					}					
				}
				break;
		case -1:if(gInputData.reverse){	
					gInputData.throttle-=3*kFrameDuration;
					if(gInputData.throttle<-1)gInputData.throttle=-1;
					gInputData.brake=0;
					if(playerVelo>0)
					{
						switchRequest=true;
						gSwitchDelayStart=gFrameCount-kMinSwitchDelay;
					}	
				}				
				else{
					gInputData.brake+=kFrameDuration*6;
					if(gInputData.brake>1)gInputData.brake=1;
					gInputData.throttle=ThrottleReset(gInputData.throttle);
					if(!playerVelo)
						switchRequest=true;
					if(playerVelo<0)
					{
						switchRequest=true;
						gSwitchDelayStart=gFrameCount-kMinSwitchDelay;
					}					
				}
				break;
		case 0 :gInputData.brake=0;
				gInputData.throttle=ThrottleReset(gInputData.throttle);
				break;
	}
	if(GetElement(kKickdown)&&axState!=-1)
	{
		gInputData.kickdown=true;
		gInputData.throttle=1;
		if(gInputData.reverse&&!gInputData.brake)
		{
			switchRequest=true;
			gSwitchDelayStart=gFrameCount-kMinSwitchDelay;
		}
	}
	axState=0;		
	if(GetElement(kRight))axState=1;
	if(GetElement(kLeft))axState=-1;
	switch(axState)
	{
		case 1 :gInputData.steering+=(gInputData.steering<0)?8:3*kFrameDuration;
				if(gInputData.steering>1)gInputData.steering=1;break;
		case -1:gInputData.steering-=(gInputData.steering>0)?8:3*kFrameDuration;
				if(gInputData.steering<-1)gInputData.steering=-1;break;
		case 0 :if(gInputData.steering>0)
				{
					gInputData.steering-=8*kFrameDuration;
					if(gInputData.steering<0)
						gInputData.steering=0;
				}
				else {
					gInputData.steering+=8*kFrameDuration;
					if(gInputData.steering>0)
						gInputData.steering=0;
				}
				break;
	}
	while(GetEvent(&element,&eventData))
		switch(element)
		{
			case kForward:
				if(!playerVelo&&gInputData.reverse&&eventData)
				{
					switchRequest=true;
					gSwitchDelayStart=gFrameCount-kMinSwitchDelay;
				}
				break;				
			case kBackward:
				if(!playerVelo&&!gInputData.reverse&&eventData)
				{
					switchRequest=true;
					gSwitchDelayStart=gFrameCount-kMinSwitchDelay;
				}
				break;				
			case kMissile:
				gMissile=eventData;
				break;
			case kFire:
				gFire=eventData;
				break;
			case kAbort:
				gEndGame=true;
				break;
/*			case kScreenshot:
				if(eventData)
					TakeScreenshot();					
				break;*/
			case kPause:
				if(eventData)
					PauseGame();
				break;
		};
	if(switchRequest&&gFrameCount>=gSwitchDelayStart+kMinSwitchDelay)
		gInputData.reverse=!gInputData.reverse;
	*data=&gInputData;
}

UInt64 GetMSTime()
{
#ifdef PORT_SDL2
	/* SDL_GetTicks64 not available in Emscripten SDL2 port; use SDL_GetTicks */
#if defined(__EMSCRIPTEN__)
	return (UInt64)SDL_GetTicks() * 1000ULL;
#else
	return (UInt64)SDL_GetTicks64() * 1000ULL;
#endif
#else
	if(gInputISp)
	{
		AbsoluteTime t=ISpUptime();
		UInt64 tMS;
		DoError(ISpTimeToMicroseconds(&t,(UnsignedWide*)&tMS));
		return tMS;
	}
	else
	{
		Nanoseconds nWide=AbsoluteToNanoseconds(UpTime());
		UInt64 n=*((UInt64*)&nWide);
		UInt64 tMS=n/1000;
		return tMS;
	}
#endif
}

void FlushInput()
{
#ifndef PORT_SDL2
	if(gInputISp)
		DoError(ISpElementList_Flush(gEventElements));
#endif
}

#ifndef PORT_SDL2
void GetKeyPress(int element,DialogPtr keyDlg,UInt8 *elements)
{
	int i,pressed=false;
	short type;
	Rect box;
	Handle item;
	Str255 text;
	EventRecord event;
	SelectDialogItemText(keyDlg,element+4,0,32767);
	WaitNextEvent(everyEvent,&event,0,nil);
	while(!pressed)
		for(i=0;i<128;i++)
			if(IsPressed(i))
			{
				elements[element]=i;
				GetDialogItem(keyDlg,element+4,&type,&item,&box);
				GetIndString(text,128,i+1);
				SetDialogItemText(item,text);			
				pressed=true;
			}
			else if(Button()) pressed=true;
	SaveFlushEvents();
}

void GetHIDPress(int element,DialogPtr keyDlg,UInt8 *elements)
{
	int i,pressed=false;
	short type;
	Rect box;
	Handle item;
	Str255 text;
	SelectDialogItemText(keyDlg,element+4,0,32767);
	while(!pressed)
		for(i=0;i<gNumHIDElements;i++)
			if(gElements[i]->type==2)//at the moment, we only support buttons
			{
				if(HIDGetElementValue(gController,gElements[i]))
				{
					Str255 text="\x0a" "Button XXX";
					GetDialogItem(keyDlg,element+4,&type,&item,&box);
					elements[element]=i;
					text[10]='0'+(elements[element]%10);
					text[9]='0'+((elements[element]/10)%10);
					text[8]='0'+((elements[element]/100)%10);
					SetDialogItemText(item,text);	
					pressed=true;
				}
			}
			else if(Button()) pressed=true;
}

void ConfigureHID()
{
	if(gInputHID)
	{
		DialogPtr keyDlg=GetNewDialog(135,nil,(WindowPtr)-1L);
		short hit;
		short type;
		Rect box;
		Handle item;
		int i;
		UInt8 elements[8];
		DoError(SetDialogDefaultItem(keyDlg,2));
		DoError(SetDialogCancelItem(keyDlg,3));
		for(i=0;i<8;i++)
		{
			Str255 text="\x0a" "Button XXX";
			GetDialogItem(keyDlg,i+4,&type,&item,&box);
			elements[i]=gPrefs.hidElements[i];
			text[10]='0'+(elements[i]%10);
			text[9]='0'+((elements[i]/10)%10);
			text[8]='0'+((elements[i]/100)%10);
			SetDialogItemText(item,text);	
		}		
		do{
			SelectDialogItemText(keyDlg,21,0,0);
			ModalDialog(nil,&hit);
			if(hit>=4&&hit<12&&!IsPressed(0x30))
				GetHIDPress(hit-4,keyDlg,elements);
		}while(hit!=2&&hit!=3);
		if(hit==2)
			for(i=0;i<8;i++)
				gPrefs.hidElements[i]=elements[i];
		DisposeDialog(keyDlg);	
	}
	else
	{
		int hit;
		AlertStdAlertParamRec alertParam={
		false,false,nil,
		nil,
		nil,
		nil,
		kAlertStdAlertOKButton,
		0,
		kWindowDefaultPosition};
		DoError(StandardAlert(kAlertStopAlert,
			"\x23Couldn't find a compatible Gamepad.",
			"\x31Plug in your Gamepad and re-launch Reckless Drivin'.",
			&alertParam,
			&hit));
	}
}

void ConfigureInput()
{
	if(gInputISp)
		DoError(ISpConfigure(nil));
	else
	{
		DialogPtr keyDlg=GetNewDialog(134,nil,(WindowPtr)-1L);
		short hit;
		short type;
		Rect box;
		Handle item;
		Str255 text;
		int i;
		UInt8 elements[8];
		DoError(SetDialogDefaultItem(keyDlg,2));
		DoError(SetDialogCancelItem(keyDlg,3));
		for(i=0;i<8;i++)
		{
			GetDialogItem(keyDlg,i+4,&type,&item,&box);
			GetIndString(text,128,gPrefs.keyCodes[i]+1);
			elements[i]=gPrefs.keyCodes[i];
			SetDialogItemText(item,text);	
		}		
		do{
			SelectDialogItemText(keyDlg,21,0,0);
			ModalDialog(nil,&hit);
			if(hit>=4&&hit<12&&!IsPressed(0x30))
				GetKeyPress(hit-4,keyDlg,elements);
			if(hit==23)
				ConfigureHID();
		}while(hit!=2&&hit!=3);
		if(hit==2)
			for(i=0;i<8;i++)
				gPrefs.keyCodes[i]=elements[i];
		DisposeDialog(keyDlg);
	}
}
#endif /* !PORT_SDL2 */