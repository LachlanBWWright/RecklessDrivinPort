/*
 * mac_compat.h - Mac OS 9 compatibility layer for modern platforms
 *
 * This header provides type definitions and function stubs to allow
 * the Reckless Drivin' source code to compile on modern operating systems.
 *
 * Based on Pomme (https://github.com/jorio/Pomme) type definitions.
 * See also Nathan Craddock's port analysis at https://nathancraddock.com/
 */

#ifndef MAC_COMPAT_H
#define MAC_COMPAT_H

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <stddef.h>

/*---------------------------------------------------------------------------*/
/* Integer types                                                              */
/*---------------------------------------------------------------------------*/

typedef int8_t   SignedByte;
typedef int8_t   SInt8;
typedef int16_t  SInt16;
typedef int32_t  SInt32;
typedef int64_t  SInt64;

typedef uint8_t  Byte;
typedef uint8_t  UInt8;
typedef uint8_t  Boolean;
typedef uint16_t UInt16;
typedef uint32_t UInt32;
typedef uint64_t UInt64;

typedef struct { UInt32 lo, hi; } UnsignedWide;
typedef UnsignedWide AbsoluteTime;

/*---------------------------------------------------------------------------*/
/* Fixed/fract types                                                         */
/*---------------------------------------------------------------------------*/

typedef SInt32 Fixed;
typedef SInt32 Fract;
typedef UInt32 UnsignedFixed;
typedef SInt16 ShortFixed;

/*---------------------------------------------------------------------------*/
/* Basic system types                                                        */
/*---------------------------------------------------------------------------*/

typedef SInt16 OSErr;
typedef SInt32 OSStatus;
typedef void  *LogicalAddress;
typedef UInt32 FourCharCode;
typedef FourCharCode OSType;
typedef FourCharCode ResType;
typedef char  *Ptr;      /* Pointer to non-relocatable block */
typedef Ptr   *Handle;   /* Pointer to master pointer */
typedef long   Size;
typedef void (*ProcPtr)(void);

/*---------------------------------------------------------------------------*/
/* Pascal String types                                                       */
/*---------------------------------------------------------------------------*/

typedef char Str15[16];
typedef char Str31[32];
typedef char Str32[33];
typedef char Str63[64];
typedef char Str255[256];
typedef char *StringPtr;
typedef const char *ConstStr255Param;

/*---------------------------------------------------------------------------*/
/* Point & Rect types                                                        */
/*---------------------------------------------------------------------------*/

typedef struct Point { SInt16 v, h; } Point;
typedef struct Rect  { SInt16 top, left, bottom, right; } Rect;
typedef Point *PointPtr;
typedef Rect  *RectPtr;

/*---------------------------------------------------------------------------*/
/* Big-endian byte-swap helpers for Mac resource data                        */
/*                                                                           */
/* All multi-byte values stored in Mac resource binary data are big-endian.  */
/* On little-endian hosts (x86/x86_64) we must byte-swap them before use.   */
/*---------------------------------------------------------------------------*/

static inline uint16_t be16_swap(uint16_t v) {
#if __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__
    return (uint16_t)(((v & 0xFF00u) >> 8) | ((v & 0x00FFu) << 8));
#else
    return v;
#endif
}
static inline uint32_t be32_swap(uint32_t v) {
#if __BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__
    return ((v & 0xFF000000u) >> 24) | ((v & 0x00FF0000u) >> 8) |
           ((v & 0x0000FF00u) <<  8) | ((v & 0x000000FFu) << 24);
#else
    return v;
#endif
}
/* Swap a Mac Rect (fields are big-endian SInt16 in resource data) */
static inline void SwapRect(Rect *r) {
    r->top    = (SInt16)be16_swap((uint16_t)r->top);
    r->left   = (SInt16)be16_swap((uint16_t)r->left);
    r->bottom = (SInt16)be16_swap((uint16_t)r->bottom);
    r->right  = (SInt16)be16_swap((uint16_t)r->right);
}


typedef struct FSSpec {
    short  vRefNum;
    long   parID;
    Str255 name;  /* Pascal string (original Mac field name) */
} FSSpec;

typedef Handle AliasHandle;

/*---------------------------------------------------------------------------*/
/* QuickDraw types                                                           */
/*---------------------------------------------------------------------------*/

typedef SInt16 QDErr;

typedef struct RGBColor {
    UInt16 red;
    UInt16 green;
    UInt16 blue;
} RGBColor;

typedef UInt8 Pattern[8];

typedef struct Picture {
    SInt16 picSize;
    Rect   picFrame;
    Ptr    __pomme_pixelsARGB32;
} Picture;

typedef Picture  *PicPtr;
typedef PicPtr   *PicHandle;
typedef Handle    GDHandle;

typedef struct PixMap {
    Ptr      baseAddr;
    SInt16   rowBytes;
    Rect     bounds;
    SInt16   pmVersion;
    SInt16   packType;
    SInt32   packSize;
    SInt32   hRes;
    SInt32   vRes;
    SInt16   pixelType;
    SInt16   pixelSize;
    SInt16   cmpCount;
    SInt16   cmpSize;
    SInt32   planeBytes;
    Handle   pmTable;
    SInt32   pmReserved;
} PixMap;

typedef PixMap  *PixMapPtr;
typedef PixMapPtr *PixMapHandle;

/* Classic QuickDraw BitMap (1-bit, uncolored) */
typedef struct BitMap {
    Ptr    baseAddr;
    SInt16 rowBytes;
    Rect   bounds;
} BitMap;
typedef BitMap  *BitMapPtr;
typedef BitMapPtr *BitMapHandle;

typedef struct GWorld {
    int dummy;
} GWorld;
typedef GWorld *GWorldPtr;

typedef struct ColorSpec {
    short    value;
    RGBColor rgb;
} ColorSpec;
typedef ColorSpec *ColorSpecPtr;

typedef struct ColorTable {
    SInt32        ctSeed;
    short         ctFlags;
    short         ctSize;
    ColorSpec     ctTable[1];
} ColorTable;
typedef ColorTable *CTabPtr;
typedef CTabPtr    *CTabHandle;

typedef struct Region {
    int dummy;
} Region;
typedef Region *RgnHandle;

typedef struct GrafPort {
    int dummy;
} GrafPort;
typedef GrafPort *GrafPtr;
typedef GrafPtr   WindowPtr;
typedef WindowPtr WindowRef;

typedef struct OpaqueDialogPtr {
    int dummy;
} OpaqueDialogPtr;
typedef OpaqueDialogPtr *DialogPtr;
typedef DialogPtr        DialogRef;

typedef Handle ControlHandle;
typedef Handle MenuHandle;

/* PortList is defined in source/IsPortListValid.c with specific alignment */
/* typedef struct PortList { short count; GrafPtr ports[1]; } PortList; */
/* typedef PortList **PortListHdl; */

/*---------------------------------------------------------------------------*/
/* Event types                                                               */
/*---------------------------------------------------------------------------*/

typedef UInt32 KeyMap[4];
typedef UInt8  KeyMapByteArray[16];

typedef struct EventRecord {
    UInt16 what;
    UInt32 message;
    UInt32 when;
    Point  where;
    UInt16 modifiers;
} EventRecord;

enum {
    nullEvent       = 0,
    mouseDown       = 1,
    mouseUp         = 2,
    keyDown         = 3,
    keyUp           = 4,
    autoKey         = 5,
    updateEvt       = 6,
    diskEvt         = 7,
    activateEvt     = 8,
    osEvt           = 15,
    kHighLevelEvent = 23,
    everyEvent      = 0xFFFF
};

enum {
    mDownMask    = 1 << mouseDown,
    mUpMask      = 1 << mouseUp,
    keyDownMask  = 1 << keyDown,
    keyUpMask    = 1 << keyUp,
    autoKeyMask  = 1 << autoKey,
    updateMask   = 1 << updateEvt,
    activMask    = 1 << activateEvt,
    osMask       = 1 << osEvt,
    highLevelEventMask = 0x0400
};

enum {
    inDrag = 4
};

enum {
    charCodeMask  = 0x000000FF,
    keyCodeMask   = 0x0000FF00
};

/* osEvt sub-event types */
enum {
    mouseMovedMessage   = 0xFA,
    suspendResumeMessage= 0x01,
    resumeFlag          = 1
};

/* Key modifier bits */
enum {
    activeFlag      = 1,
    btnState        = 128,
    cmdKey          = 256,
    shiftKey        = 512,
    alphaLock       = 1024,
    optionKey       = 2048,
    controlKey      = 4096
};

/*---------------------------------------------------------------------------*/
/* Sound Manager types                                                       */
/*---------------------------------------------------------------------------*/

typedef struct SndCommand {
    unsigned short cmd;
    short          param1;
    union {
        long param2;
        Ptr  ptr;
    };
} SndCommand;

typedef struct SCStatus {
    UnsignedFixed scStartTime;
    UnsignedFixed scEndTime;
    UnsignedFixed scCurrentTime;
    Boolean       scChannelBusy;
    Boolean       scChannelDisposed;
    Boolean       scChannelPaused;
    Boolean       scUnused;
    unsigned long scChannelAttributes;
    long          scCPULoad;
} SCStatus;

struct SndChannel;
typedef void (*SndCallBackProcPtr)(struct SndChannel *chan, SndCommand *cmd);
typedef SndCallBackProcPtr SndCallbackUPP;

typedef struct SndChannel {
    struct SndChannel *nextChan;
    SndCallBackProcPtr callBack;
    long long          userInfo;
    Ptr                channelImpl;
} SndChannel;
typedef SndChannel *SndChannelPtr;

typedef struct ModRef {
    unsigned short modNumber;
    long           modInit;
} ModRef;

typedef struct SndListResource {
    short    format;
    short    numModifiers;
    ModRef   modifierPart[1];
    short    numCommands;
    SndCommand commandPart[1];
    UInt8    dataPart[1];
} SndListResource;

typedef SCStatus      *SCStatusPtr;
typedef SndListResource *SndListPtr;
typedef SndListPtr    *SndListHandle;
typedef SndListHandle  SndListHndl;

/*---------------------------------------------------------------------------*/
/* 'vers' resource                                                           */
/*---------------------------------------------------------------------------*/

typedef struct NumVersion {
    UInt8 nonRelRev;
    UInt8 stage;
    UInt8 minorAndBugRev;
    UInt8 majorRev;
} NumVersion;

/*---------------------------------------------------------------------------*/
/* Apple Events                                                              */
/*---------------------------------------------------------------------------*/

typedef ResType AEEventClass;
typedef ResType AEEventID;
typedef OSType  DescType;
typedef Handle  AEDataStorage;

typedef struct AEDesc {
    DescType    descriptorType;
    AEDataStorage dataHandle;
} AEDesc;

typedef AEDesc AEDescList;
typedef AEDesc AERecord;
typedef AEDesc AppleEvent;
typedef AEDesc AEAddressDesc;
typedef UInt32 AEKeyword;

#define kAEKeyword AEKeyword

typedef OSErr (*AEEventHandlerProcPtr)(const AppleEvent *theAppleEvent,
                                        AppleEvent *reply, long handlerRefcon);
typedef AEEventHandlerProcPtr AEEventHandlerUPP;

#define NewAEEventHandlerUPP(proc) ((AEEventHandlerUPP)(proc))

enum {
    kCoreEventClass = 'aevt',
    kAEOpenApplication = 'oapp',
    kAEOpenDocuments   = 'odoc',
    kAEPrintDocuments  = 'pdoc',
    kAEQuitApplication = 'quit'
};

enum {
    keyDirectObject       = '----',
    keyMissedKeywordAttr  = 'miss',
    typeWildCard          = '****',
    typeAEList            = 'list',
    typeAlias             = 'alis',
    typeFSS               = 'fss '
};

enum {
    errAEDescNotFound = -1701,
    errAEParamMissed  = -1702
};

/*---------------------------------------------------------------------------*/
/* Component Manager types (Sound)                                           */
/*---------------------------------------------------------------------------*/

typedef struct ComponentDescription {
    OSType componentType;
    OSType componentSubType;
    OSType componentManufacturer;
    UInt32 componentFlags;
    UInt32 componentFlagsMask;
} ComponentDescription;

typedef void *Component;
typedef void *ComponentInstance;

typedef struct SoundInfoList {
    short   count;
    Handle  infoHandle;
} SoundInfoList;

/*---------------------------------------------------------------------------*/
/* Error codes                                                               */
/*---------------------------------------------------------------------------*/

enum {
    noErr          = 0,
    fnfErr         = -43,
    dskFulErr      = -34,
    memFullErr     = -108,
    paramErr       = -50,
    resNotFound    = -192,
    resFNotFound   = -193,
    ioErr          = -36,
    eofErr         = -39,
    rfNumErr       = -51,
    permErr        = -54,
    dupFNErr       = -48,
    dirNFErr       = -120,
    unimpErr       = -4
};

enum {
    smSystemScript = 0
};

enum {
    gestaltSystemVersion = 'sysv',
    gestaltProcClkSpeed  = 'pclk'
};

enum {
    fsRdPerm   = 1,
    fsWrPerm   = 2,
    fsRdWrPerm = 3,
    fsCurPerm  = 0
};

enum {
    fsAtMark    = 0,
    fsFromStart = 1,
    fsFromLEOF  = 2,
    fsFromMark  = 3
};

enum {
    kPreferencesFolderType = 'pref',
    kOnSystemDisk          = -32768L,
    kCreateFolder          = 1,
    kDontCreateFolder      = 0
};

enum {
    srcCopy = 0, srcOr = 1, srcXor = 2, srcBic = 3,
    notSrcCopy = 4, notSrcOr = 5, notSrcXor = 6, notSrcBic = 7,
    patCopy = 8, patOr = 9, patXor = 10, patBic = 11,
    notPatCopy = 12, notPatOr = 13, notPatXor = 14, notPatBic = 15,
    transparent = 36
};

enum {
    whiteColor   = 30, blackColor  = 33, yellowColor = 69,
    magentaColor = 137, redColor   = 205, cyanColor   = 273,
    greenColor   = 341, blueColor  = 409
};

enum {
    bold = 1, italic = 2, underline = 4, outline = 8,
    shadow = 16, condense = 32, extend = 64
};

enum {
    normal = 0
};

enum {
    kAlertStdAlertOKButton = 1
};

enum {
    kWindowDefaultPosition = 0
};

enum {
    kSoundOutputDeviceType = 'sdev'
};

/* Sound Manager init flags */
enum {
    initMono       = 0x0080,  /* mono channel */
    initStereo     = 0x00C0,  /* stereo channel */
    initNoDrop     = 0x0004,  /* no drop samples when CPU slows */
    initNoInterp   = 0x0002,  /* no linear interpolation */
    initChan0      = 0x0004,  /* play on channel 0 */
    initChan1      = 0x0002,  /* play on channel 1 */
    initChan2      = 0x0001,  /* play on channel 2 */
    initChan3      = 0x0000,  /* play on channel 3 */
    sampledSynth   = 5,       /* sampled sound synthesizer */
    squareWaveSynth= 1,       /* square wave synthesizer */
    waveTableSynth = 3,       /* wave table synthesizer */
    asyncSound     = 0x0020   /* asynchronous sound */
};

enum {
    siSampleRate          = 'srat',
    siSampleRateAvailable = 'srav'
};

/* Sound rates */
enum {
    rate44khz   = 0xAC440000,
    rate22050hz = 0x56220000
};

/* Universal Procedure Pointers (UPP) - simplified for modern platforms */
typedef void *UniversalProcPtr;
#define NewSndCallBackUPP(proc) ((SndCallbackUPP)(proc))
#define DisposeSndCallBackUPP(proc) do { (void)(proc); } while(0)

/* Sound command codes */
enum {
    nullCmd         = 0,
    quietCmd        = 3,
    flushCmd        = 4,
    bufferCmd       = 81,
    callBackCmd     = 13,
    rateMultiplierCmd = 86,
    rateCmd         = 82,
    getRateCmd      = 85,
    volumeCmd       = 46
};

/*---------------------------------------------------------------------------*/
/* Alert types                                                               */
/*---------------------------------------------------------------------------*/

typedef UInt16 AlertType;
enum {
    kAlertStopAlert  = 0,
    kAlertNoteAlert  = 1,
    kAlertCautionAlert = 2,
    kAlertPlainAlert = 3
};

typedef struct AlertStdAlertParamRec {
    Boolean         movable;
    Boolean         helpButton;
    void           *filterProc;
    ConstStr255Param defaultText;
    ConstStr255Param cancelText;
    ConstStr255Param otherText;
    SInt16          defaultButton;
    SInt16          cancelButton;
    UInt16          position;
} AlertStdAlertParamRec;

/*---------------------------------------------------------------------------*/
/* Nil / NULL                                                                */
/*---------------------------------------------------------------------------*/

#ifndef nil
#define nil NULL
#endif

/*---------------------------------------------------------------------------*/
/* kUnresolvedCFragSymbolAddress - used for CFM symbol checking              */
/*---------------------------------------------------------------------------*/
#define kUnresolvedCFragSymbolAddress ((void*)-1)

/*---------------------------------------------------------------------------*/
/* Pragma alignment (no-op on modern compilers)                              */
/*---------------------------------------------------------------------------*/
#define PRAGMA_STRUCT_ALIGN  0
#define PRAGMA_STRUCT_PACKPUSH 1
#define PRAGMA_STRUCT_PACK   0

/*---------------------------------------------------------------------------*/
/* Dialog item types                                                         */
/*---------------------------------------------------------------------------*/
enum {
    ctrlItem    = 4,
    chkCtrl     = 1,
    radCtrl     = 2,
    resCtrl     = 0,
    statText    = 8,
    editText    = 16,
    iconItem    = 32,
    picItem     = 64,
    userItem    = 0,
    itemDisable = 128
};

/*---------------------------------------------------------------------------*/
/* Function declarations (stubs - implemented in mac_stubs.c)                */
/*---------------------------------------------------------------------------*/

/* Memory Manager */
Handle  NewHandle(Size s);
Handle  NewHandleClear(Size s);
Handle  NewHandleSys(Size s);
Size    GetHandleSize(Handle h);
void    SetHandleSize(Handle h, Size s);
void    DisposeHandle(Handle h);
OSErr   PtrToHand(const void *srcPtr, Handle *dstHndl, Size size);
Ptr     NewPtr(Size s);
Ptr     NewPtrClear(Size s);
Size    GetPtrSize(Ptr p);
void    DisposePtr(Ptr p);
void    BlockMove(const void *src, void *dst, Size n);
void    BlockMoveData(const void *src, void *dst, Size n);
static inline void HLock(Handle h) { (void)h; }
static inline void HLockHi(Handle h) { (void)h; }
static inline void HUnlock(Handle h) { (void)h; }
static inline void HNoPurge(Handle h) { (void)h; }
static inline void MaxApplZone(void) {}
static inline void MoreMasters(void) {}

/* Resource Manager */
OSErr  ResError(void);
void   UseResFile(short refNum);
short  CurResFile(void);
void   CloseResFile(short refNum);
short  Count1Resources(ResType t);
short  Count1Types(void);
Handle GetResource(ResType theType, short theID);
Handle Get1IndResource(ResType theType, short index);
void   GetResInfo(Handle res, short *theID, ResType *theType, char *name256);
void   ReleaseResource(Handle res);
void   RemoveResource(Handle res);
void   AddResource(Handle data, ResType type, short id, const char *name);
void   ChangedResource(Handle res);
void   WriteResource(Handle res);
void   DetachResource(Handle res);
long   GetResourceSizeOnDisk(Handle res);
long   SizeResource(Handle res);
void   SetResLoad(Boolean load);
Handle Get1Resource(ResType theType, short theID);

/* File Manager */
OSErr  FSMakeFSSpec(short vRefNum, long dirID, const char *cName, FSSpec *spec);
short  FSpOpenResFile(const FSSpec *spec, char permission);
OSErr  FSpOpenDF(const FSSpec *spec, char permission, short *refNum);
OSErr  FSpOpenRF(const FSSpec *spec, char permission, short *refNum);
OSErr  FSOpen(const char *cName, short vRefNum, short *refNum);
short  OpenResFile(const char *cName);
OSErr  FSpCreate(const FSSpec *spec, OSType creator, OSType fileType, short scriptTag);
OSErr  FSpDelete(const FSSpec *spec);
OSErr  FindFolder(short vRefNum, OSType folderType, Boolean createFolder, short *foundVRefNum, long *foundDirID);
OSErr  FSRead(short refNum, long *count, Ptr buffPtr);
OSErr  FSWrite(short refNum, long *count, Ptr buffPtr);
OSErr  FSClose(short refNum);
OSErr  GetEOF(short refNum, long *logEOF);
OSErr  SetEOF(short refNum, long logEOF);
OSErr  GetFPos(short refNum, long *filePos);
OSErr  SetFPos(short refNum, short posMode, long filePos);

/* Time Manager */
void   GetDateTime(unsigned long *secs);
void   Microseconds(UnsignedWide *microTickCount);
UInt32 TickCount(void);

/* QuickDraw 2D */
void   SetRect(Rect *r, short left, short top, short right, short bottom);
void   OffsetRect(Rect *r, short dh, short dv);
void   GetGWorld(GWorldPtr *port, GDHandle *gdh);
void   SetGWorld(GWorldPtr port, GDHandle gdh);
OSErr  NewGWorld(GWorldPtr *offscreenGWorld, short pixelDepth, const Rect *boundsRect,
                 CTabHandle cTable, GDHandle aGDevice, UInt32 flags);
void   DisposeGWorld(GWorldPtr offscreenGWorld);
PixMapHandle GetGWorldPixMap(GWorldPtr offscreenGWorld);
Ptr    GetPixBaseAddr(PixMapHandle pm);
Boolean LockPixels(PixMapHandle pm);
static inline void UnlockPixels(PixMapHandle pm) { (void)pm; }
static inline void NoPurgePixels(PixMapHandle pm) { (void)pm; }
CTabHandle GetCTable(short ctID);
void   DisposeCTable(CTabHandle ctab);
/* OpenCPicture parameters */
typedef struct OpenCPicParams {
    Rect        srcRect;
    Fixed       hRes;
    Fixed       vRes;
    short       version;
    short       reserved1;
    long        reserved2;
} OpenCPicParams;

PicHandle  OpenCPicture(const OpenCPicParams *newHeader);
void       ClosePicture(void);
void       CopyBits(const BitMap *srcBits, const BitMap *dstBits,
                    const Rect *srcRect, const Rect *dstRect,
                    short mode, void *maskRgn);
const BitMap *GetPortBitMapForCopyBits(GWorldPtr port);
void       GetPortBounds(GWorldPtr port, Rect *bounds);

/* QuickDraw: Regions */
void   SetEmptyRgn(RgnHandle rgn);
void   OpenRgn(void);
void   CloseRgn(RgnHandle dstRgn);
void   DiffRgn(RgnHandle srcRgnA, RgnHandle srcRgnB, RgnHandle dstRgn);
Boolean PtInRect(Point pt, const Rect *r);
Boolean StillDown(void);

/* Window update regions */
void   BeginUpdate(WindowPtr w);
void   EndUpdate(WindowPtr w);
void   Delay(long numTicks, UInt32 *finalTicks);

/* Random number generator */
short  Random(void);
void   SetQDGlobalsRandomSeed(long seed);

/* String resources */
void   GetIndString(char *theString, short strListID, short index);
void   SelectDialogItemText(DialogPtr dialog, short itemNo, short strtSel, short endSel);

/* Memory Manager extra */
OSErr  HandToHand(Handle *theHndl);
OSErr  MemError(void);

/* __abs is CodeWarrior's absolute value - map to standard abs */
#include <math.h>
#define __abs(x) (abs(x))
void   DrawPicture(PicHandle myPicture, const Rect *dstRect);
void   KillPicture(PicHandle myPicture);
void   FillRect(const Rect *r, const Pattern *pat);
void   EraseRect(const Rect *r);
void   PaintRect(const Rect *r);
void   InvertRect(const Rect *r);
void   FrameRect(const Rect *r);
void   MoveTo(short h, short v);
void   LineTo(short h, short v);
void   Line(short dh, short dv);
void   DrawString(const char *s);
void   TextFont(short font);
void   TextSize(short size);
void   TextMode(short mode);
void   TextFace(short face);
void   ForeColor(long color);
void   BackColor(long color);
void   RGBForeColor(const RGBColor *color);
void   RGBBackColor(const RGBColor *color);
void   NumToString(long theNum, char *theString);
long   StringToNum(const char *theString, long *theNum);
void   UpperString(char *theString, Boolean diacSensitive);
/* GetScreenGW is defined in screen.c */
GWorldPtr GetScreenGW(void);
void   GetQDGlobalsBlack(Pattern *black);
RgnHandle NewRgn(void);
void   DisposeRgn(RgnHandle rgn);
void   RectRgn(RgnHandle rgn, const Rect *r);
void   SetRectRgn(RgnHandle rgn, short left, short top, short right, short bottom);
RgnHandle GetGrayRgn(void);
void   GetRegionBounds(RgnHandle rgn, Rect *bounds);
short  GetPixelSize(PixMapHandle pm);
short  StringWidth(const char *s);
void   Move(short dh, short dv);

/* Window Manager */
void   InitCursor(void);
void   HideCursor(void);
void   ShowCursor(void);
void   DragWindow(WindowPtr w, Point startPt, const Rect *boundsRect);
short  FindWindow(Point pt, WindowPtr *which);
void   HideWindow(WindowPtr w);
void   ShowWindow(WindowPtr w);
void   SelectWindow(WindowPtr w);

/* Dialog Manager */
DialogPtr GetNewDialog(short id, void *wStorage, WindowPtr behind);
void   DisposeDialog(DialogPtr dialog);
void   ModalDialog(void *filterProc, short *itemHit);
void   GetDialogItem(DialogPtr dialog, short itemNo, short *itemType,
                     Handle *item, Rect *box);
void   SetDialogItemText(Handle item, const char *text);
void   GetDialogItemText(Handle item, char *text);
OSErr  SetDialogDefaultItem(DialogPtr dialog, short newItem);
OSErr  SetDialogCancelItem(DialogPtr dialog, short newItem);
OSErr  GetDialogItemAsControl(DialogPtr dialog, short itemNo, ControlHandle *control);
void   SetControlValue(ControlHandle the_control, short newValue);
short  GetControlValue(ControlHandle the_control);
OSErr  HiliteControl(ControlHandle theControl, short hiliteState);
OSErr  DeactivateControl(ControlHandle theControl);
OSErr  ActivateControl(ControlHandle theControl);
OSErr  CountSubControls(ControlHandle inControl, UInt16 *outNumChildren);
OSErr  GetIndexedSubControl(ControlHandle inControl, UInt16 inIndex, ControlHandle *outSubControl);

/* Notification / Alert */
OSErr  StandardAlert(AlertType alertType, const char *error, const char *explanation,
                     const AlertStdAlertParamRec *param, short *itemHit);
short  StopAlert(short alertID, void *filterProc);

/* Menu Manager */
OSErr  RegisterAppearanceClient(void);

/* Apple Events */
OSErr  AEInstallEventHandler(AEEventClass eventClass, AEEventID eventID,
                              AEEventHandlerUPP handler, long handlerRefcon, Boolean isSysHandler);
OSErr  AEGetParamDesc(const AppleEvent *theAppleEvent, AEKeyword theAEKeyword,
                      DescType desiredType, AEDesc *result);
OSErr  AEGetAttributePtr(const AppleEvent *theAppleEvent, AEKeyword theAEKeyword,
                          DescType desiredType, DescType *typeCode, void *dataPtr,
                          Size maximumSize, Size *actualSize);
OSErr  AECountItems(const AEDescList *theAEDescList, long *theCount);
OSErr  AEGetNthPtr(const AEDescList *theAEDescList, long index, DescType desiredType,
                   AEKeyword *theAEKeyword, DescType *typeCode, void *dataPtr,
                   Size maximumSize, Size *actualSize);
OSErr  AEDisposeDesc(AEDesc *theAEDesc);

/* Misc System calls */
OSErr  Gestalt(OSType selector, SInt32 *response);
void   ExitToShell(void);
void   DebugStr(const char *debuggerMsg);
Boolean WaitNextEvent(short eventMask, EventRecord *theEvent, long sleep, void *mouseRgn);
void   FlushEvents(short eventMask, short stopMask);
OSErr  AEProcessAppleEvent(const EventRecord *theEventRecord);
Boolean IsDialogEvent(const EventRecord *theEvent);
Boolean DialogSelect(const EventRecord *theEvent, DialogPtr *theDialog, short *itemHit);
Boolean Button(void);
void   GetKeys(KeyMap theKeys);
void   TEFromScrap(void);

/* Sound Manager */
OSErr  SndNewChannel(SndChannelPtr *chan, short synth, long init, SndCallBackProcPtr userRoutine);
OSErr  SndDisposeChannel(SndChannelPtr chan, Boolean quietNow);
OSErr  SndDoImmediate(SndChannelPtr chan, const SndCommand *cmd);
OSErr  SndDoCommand(SndChannelPtr chan, const SndCommand *cmd, Boolean noWait);
OSErr  SndChannelStatus(SndChannelPtr chan, short theLength, SCStatusPtr theStatus);
NumVersion SndSoundManagerVersion(void);
OSErr  GetSoundOutputInfo(ComponentInstance ci, OSType selector, void *infoPtr);
OSErr  SetSoundOutputInfo(ComponentInstance ci, OSType selector, void *infoPtr);
Component FindNextComponent(Component aComponent, ComponentDescription *looking);

/* Time types and functions needed by input.c */
typedef UnsignedWide Nanoseconds;
AbsoluteTime UpTime(void);
Nanoseconds  AbsoluteToNanoseconds(AbsoluteTime a);

/* GetMSTime - microsecond timer declared in input.h, implemented in input.c */
/* UInt64 GetMSTime(void); -- declared in input.h */

/* pascal calling convention - no-op on modern platforms */
#ifndef pascal
#define pascal
#endif

/* CodeWarrior-specific macros */
#ifndef __option
#define __option(x) 0
#endif

/* Inline no-ops and compat macros */
#define CALL_IN_SPOCKETS_BUT_NOT_IN_CARBON
#define CALL_NOT_IN_CARBON

/* -----------------------------------------------------------------------
 * LOG_DEBUG – diagnostic printf guarded by the DEBUG preprocessor symbol.
 * Define DEBUG at compile time (e.g. -DDEBUG) to enable all LOG: output.
 * In release builds these expand to nothing so no output is produced.
 * ----------------------------------------------------------------------- */
#ifdef DEBUG
#  include <stdio.h>
#  define LOG_DEBUG(...) printf(__VA_ARGS__)
#else
#  define LOG_DEBUG(...) ((void)0)
#endif

#endif /* MAC_COMPAT_H */
