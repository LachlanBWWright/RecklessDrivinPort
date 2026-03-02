/*
 * mac_stubs.c - Stub implementations of Mac OS 9 API functions
 *
 * These are minimal implementations to allow the game to compile.
 * Full implementations will be added incrementally as the port progresses.
 *
 * TODO items are marked with printf("TODO: FunctionName") statements.
 */

#include "mac_compat.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <time.h>
#include <ctype.h>

/*---------------------------------------------------------------------------*/
/* Memory Manager                                                            */
/*---------------------------------------------------------------------------*/

Handle NewHandle(Size s)
{
    Ptr  *h = (Ptr *)malloc(sizeof(Ptr));
    if (!h) return NULL;
    *h = (Ptr)malloc(s ? s : 1);
    if (!*h) { free(h); return NULL; }
    return (Handle)h;
}

Handle NewHandleClear(Size s)
{
    Handle h = NewHandle(s);
    if (h && s) memset(*h, 0, s);
    return h;
}

Handle NewHandleSys(Size s) { return NewHandle(s); }

Size GetHandleSize(Handle h)
{
    /* We store the size just before the allocation */
    if (!h || !*h) return 0;
    /* Use malloc_usable_size if available, else return a large estimate */
#ifdef __linux__
    extern size_t malloc_usable_size(void *ptr);
    return (Size)malloc_usable_size(*h);
#else
    return 0;
#endif
}

void SetHandleSize(Handle h, Size s)
{
    if (!h) return;
    *h = (Ptr)realloc(*h, s ? s : 1);
}

void DisposeHandle(Handle h)
{
    if (!h) return;
    if (*h) free(*h);
    free(h);
}

OSErr PtrToHand(const void *srcPtr, Handle *dstHndl, Size size)
{
    Handle h = NewHandle(size);
    if (!h) return -108; /* memFullErr */
    memcpy(*h, srcPtr, size);
    *dstHndl = h;
    return 0;
}

Ptr NewPtr(Size s)     { return (Ptr)malloc(s ? s : 1); }
Ptr NewPtrClear(Size s){ Ptr p = NewPtr(s); if(p && s) memset(p,0,s); return p; }
Size GetPtrSize(Ptr p) { 
#ifdef __linux__
    extern size_t malloc_usable_size(void *ptr);
    return (Size)malloc_usable_size(p); 
#else
    return 0; 
#endif
}
void DisposePtr(Ptr p) { free(p); }

void BlockMove(const void *src, void *dst, Size n)     { memmove(dst, src, n); }
void BlockMoveData(const void *src, void *dst, Size n) { memmove(dst, src, n); }

/*---------------------------------------------------------------------------*/
/* Resource Manager - backed by resources.dat                               */
/*---------------------------------------------------------------------------*/

/* Resource manager state - see resources.c for the actual implementation */
static short gCurrentResFile = 1;
static short gAppResFileRef   = 1;

/* Forward declaration to resources.c */
extern Handle Pomme_GetResource(ResType theType, short theID);
extern void   Pomme_LoadResourceFile(const char *path);
extern void   Pomme_InitResources(void);

OSErr ResError(void) { return 0; }

void UseResFile(short refNum) {
    gCurrentResFile = refNum;
}

short CurResFile(void) { return gCurrentResFile; }

void CloseResFile(short refNum) {
    printf("TODO: CloseResFile(%d)\n", refNum);
}

short Count1Resources(ResType t) {
    printf("TODO: Count1Resources\n");
    return 0;
}

short Count1Types(void) {
    printf("TODO: Count1Types\n");
    return 0;
}

Handle GetResource(ResType theType, short theID) {
    return Pomme_GetResource(theType, theID);
}

Handle Get1IndResource(ResType theType, short index) {
    printf("TODO: Get1IndResource\n");
    return NULL;
}

void GetResInfo(Handle res, short *theID, ResType *theType, char *name256) {
    printf("TODO: GetResInfo\n");
    if (theID) *theID = 0;
    if (theType) *theType = 0;
    if (name256) name256[0] = 0;
}

void ReleaseResource(Handle res) {
    if (res) DisposeHandle(res);
}

void RemoveResource(Handle res)  { printf("TODO: RemoveResource\n"); }
void AddResource(Handle data, ResType type, short id, const char *name) { printf("TODO: AddResource\n"); }
void ChangedResource(Handle res) { printf("TODO: ChangedResource\n"); }
void WriteResource(Handle res)   { printf("TODO: WriteResource\n"); }
void DetachResource(Handle res)  { printf("TODO: DetachResource\n"); }
long GetResourceSizeOnDisk(Handle res) { return GetHandleSize(res); }
long SizeResource(Handle res)          { return GetHandleSize(res); }
void SetResLoad(Boolean load)          { /* no-op */ }
Handle Get1Resource(ResType theType, short theID) {
    return Pomme_GetResource(theType, theID);
}

/*---------------------------------------------------------------------------*/
/* File Manager                                                              */
/*---------------------------------------------------------------------------*/

OSErr FSMakeFSSpec(short vRefNum, long dirID, const char *cName, FSSpec *spec) {
    if (!spec) return -50; /* paramErr */
    spec->vRefNum = vRefNum;
    spec->parID   = dirID;
    if (cName) strncpy(spec->name, cName, 255);
    else spec->name[0] = 0;
    return 0;
}

short FSpOpenResFile(const FSSpec *spec, char permission) {
    printf("TODO: FSpOpenResFile(%s)\n", spec ? spec->name : "null");
    return -1;
}

OSErr FSpOpenDF(const FSSpec *spec, char permission, short *refNum) {
    printf("TODO: FSpOpenDF(%s)\n", spec ? spec->name : "null");
    if (refNum) *refNum = -1;
    return -43; /* fnfErr */
}

OSErr FSpOpenRF(const FSSpec *spec, char permission, short *refNum) {
    printf("TODO: FSpOpenRF\n");
    if (refNum) *refNum = -1;
    return -43;
}

OSErr FSOpen(const char *cName, short vRefNum, short *refNum) {
    printf("TODO: FSOpen(%s)\n", cName ? cName : "null");
    if (refNum) *refNum = -1;
    return -43;
}

short OpenResFile(const char *cName) {
    printf("TODO: OpenResFile(%s)\n", cName ? cName : "null");
    return -1;
}

OSErr FSpCreate(const FSSpec *spec, OSType creator, OSType fileType, short scriptTag) {
    printf("TODO: FSpCreate(%s)\n", spec ? spec->name : "null");
    return 0;
}

OSErr FSpDelete(const FSSpec *spec) {
    printf("TODO: FSpDelete(%s)\n", spec ? spec->name : "null");
    return 0;
}

OSErr FindFolder(short vRefNum, OSType folderType, Boolean createFolder,
                  short *foundVRefNum, long *foundDirID) {
    printf("TODO: FindFolder\n");
    if (foundVRefNum) *foundVRefNum = 0;
    if (foundDirID)   *foundDirID   = 0;
    return 0;
}

OSErr FSRead(short refNum, long *count, Ptr buffPtr) {
    printf("TODO: FSRead\n");
    if (count) *count = 0;
    return -36; /* ioErr */
}

OSErr FSWrite(short refNum, long *count, Ptr buffPtr) {
    printf("TODO: FSWrite\n");
    return -36;
}

OSErr FSClose(short refNum) {
    printf("TODO: FSClose\n");
    return 0;
}

OSErr GetEOF(short refNum, long *logEOF) {
    printf("TODO: GetEOF\n");
    if (logEOF) *logEOF = 0;
    return 0;
}

OSErr SetEOF(short refNum, long logEOF) {
    printf("TODO: SetEOF\n");
    return 0;
}

OSErr GetFPos(short refNum, long *filePos) {
    printf("TODO: GetFPos\n");
    if (filePos) *filePos = 0;
    return 0;
}

OSErr SetFPos(short refNum, short posMode, long filePos) {
    printf("TODO: SetFPos\n");
    return 0;
}

/*---------------------------------------------------------------------------*/
/* Time Manager                                                              */
/*---------------------------------------------------------------------------*/

void GetDateTime(unsigned long *secs) {
    if (secs) *secs = (unsigned long)time(NULL);
}

void Microseconds(UnsignedWide *microTickCount) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    unsigned long long us = (unsigned long long)ts.tv_sec * 1000000ULL + ts.tv_nsec / 1000ULL;
    if (microTickCount) {
        microTickCount->lo = (UInt32)(us & 0xFFFFFFFF);
        microTickCount->hi = (UInt32)(us >> 32);
    }
}

UInt32 TickCount(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    /* 1 tick = 1/60 second */
    return (UInt32)((ts.tv_sec * 1000000000ULL + ts.tv_nsec) / 16666666ULL);
}

/* GetMSTime is implemented in source/input.c using platform time APIs */

/*---------------------------------------------------------------------------*/
/* Time functions (Mach/HW timer stubs)                                      */
/*---------------------------------------------------------------------------*/

AbsoluteTime UpTime(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    unsigned long long ns = (unsigned long long)ts.tv_sec * 1000000000ULL + ts.tv_nsec;
    AbsoluteTime at;
    at.lo = (UInt32)(ns & 0xFFFFFFFF);
    at.hi = (UInt32)(ns >> 32);
    return at;
}

Nanoseconds AbsoluteToNanoseconds(AbsoluteTime a) {
    /* AbsoluteTime and Nanoseconds are both UnsignedWide = {lo, hi} */
    return a;
}

/*---------------------------------------------------------------------------*/
/* QuickDraw 2D                                                              */
/*---------------------------------------------------------------------------*/

void SetRect(Rect *r, short left, short top, short right, short bottom) {
    if (!r) return;
    r->left = left; r->top = top; r->right = right; r->bottom = bottom;
}

void OffsetRect(Rect *r, short dh, short dv) {
    if (!r) return;
    r->left += dh; r->right += dh; r->top += dv; r->bottom += dv;
}

static GWorldPtr gScreenGWorld = NULL;

void GetGWorld(GWorldPtr *port, GDHandle *gdh) {
    if (port) *port = gScreenGWorld;
    if (gdh)  *gdh  = NULL;
}

void SetGWorld(GWorldPtr port, GDHandle gdh) {
    gScreenGWorld = port;
}

OSErr NewGWorld(GWorldPtr *offscreenGWorld, short pixelDepth, const Rect *boundsRect,
                 CTabHandle cTable, GDHandle aGDevice, UInt32 flags) {
    printf("TODO: NewGWorld\n");
    if (offscreenGWorld) {
        *offscreenGWorld = (GWorldPtr)calloc(1, sizeof(GWorld));
    }
    return 0;
}

void DisposeGWorld(GWorldPtr offscreenGWorld) {
    if (offscreenGWorld) free(offscreenGWorld);
}

PixMapHandle GetGWorldPixMap(GWorldPtr offscreenGWorld) {
    printf("TODO: GetGWorldPixMap\n");
    return NULL;
}

Ptr GetPixBaseAddr(PixMapHandle pm) {
    printf("TODO: GetPixBaseAddr\n");
    return NULL;
}

Boolean LockPixels(PixMapHandle pm) { return 1; }

CTabHandle GetCTable(short ctID) {
    printf("TODO: GetCTable(%d)\n", ctID);
    return NULL;
}

void DisposeCTable(CTabHandle ctab) {
    printf("TODO: DisposeCTable\n");
}

PicHandle GetPicture(short id) {
    printf("TODO: GetPicture(%d)\n", id);
    return NULL;
}

PicHandle OpenCPicture(const OpenCPicParams *newHeader) {
    printf("TODO: OpenCPicture\n");
    PicHandle h = (PicHandle)NewHandle(sizeof(Picture));
    if (h) memset(*h, 0, sizeof(Picture));
    return h;
}

void ClosePicture(void) { printf("TODO: ClosePicture\n"); }

void CopyBits(const BitMap *srcBits, const BitMap *dstBits,
               const Rect *srcRect, const Rect *dstRect,
               short mode, void *maskRgn) {
    printf("TODO: CopyBits\n");
}

const BitMap *GetPortBitMapForCopyBits(GWorldPtr port) {
    printf("TODO: GetPortBitMapForCopyBits\n");
    return NULL;
}

void GetPortBounds(GWorldPtr port, Rect *bounds) {
    if (bounds) { bounds->left = 0; bounds->top = 0; bounds->right = 640; bounds->bottom = 480; }
}

/*---------------------------------------------------------------------------*/
/* Additional QuickDraw functions                                             */
/*---------------------------------------------------------------------------*/

void SetEmptyRgn(RgnHandle rgn) { }
void OpenRgn(void) { }
void CloseRgn(RgnHandle dstRgn) { }
void DiffRgn(RgnHandle srcRgnA, RgnHandle srcRgnB, RgnHandle dstRgn) { }

Boolean PtInRect(Point pt, const Rect *r) {
    if (!r) return 0;
    return (pt.h >= r->left && pt.h < r->right &&
            pt.v >= r->top  && pt.v < r->bottom) ? 1 : 0;
}

Boolean StillDown(void) { return 0; }

void BeginUpdate(WindowPtr w) { }
void EndUpdate(WindowPtr w)   { }

void Delay(long numTicks, long *finalTicks) {
    /* 1 tick = 1/60 second */
    struct timespec ts;
    ts.tv_sec  = numTicks / 60;
    ts.tv_nsec = (numTicks % 60) * 16666667L;
    nanosleep(&ts, NULL);
    if (finalTicks) *finalTicks = TickCount();
}

static unsigned int gRandomSeed = 12345;

short Random(void) {
    gRandomSeed = gRandomSeed * 1103515245 + 12345;
    return (short)((gRandomSeed >> 16) & 0x7FFF);
}

void SetQDGlobalsRandomSeed(long seed) {
    gRandomSeed = (unsigned int)seed;
}

void GetIndString(char *theString, short strListID, short index) {
    if (theString) theString[0] = 0; /* empty pascal string */
}

void SelectDialogItemText(DialogPtr dialog, short itemNo, short strtSel, short endSel) { }

/*---------------------------------------------------------------------------*/
/* Memory Manager extras                                                     */
/*---------------------------------------------------------------------------*/

OSErr HandToHand(Handle *theHndl) {
    if (!theHndl || !*theHndl) return -109;
    Size s = GetHandleSize(*theHndl);
    Handle newH = NewHandle(s);
    if (!newH) return -108;
    memcpy(*newH, **theHndl, s);
    *theHndl = newH;
    return 0;
}

OSErr MemError(void) { return 0; }

void DrawPicture(PicHandle myPicture, const Rect *dstRect) {
    printf("TODO: DrawPicture\n");
}

void KillPicture(PicHandle myPicture) {
    printf("TODO: KillPicture\n");
}

void FillRect(const Rect *r, const Pattern *pat)   { printf("TODO: FillRect\n"); }
void EraseRect(const Rect *r)                       { printf("TODO: EraseRect\n"); }
void PaintRect(const Rect *r)                       { printf("TODO: PaintRect\n"); }
void InvertRect(const Rect *r)                      { printf("TODO: InvertRect\n"); }
void FrameRect(const Rect *r)                       { printf("TODO: FrameRect\n"); }
void MoveTo(short h, short v)                       { }
void LineTo(short h, short v)                       { }
void Line(short dh, short dv)                       { }
void DrawString(const char *s)                      { printf("TODO: DrawString(%s)\n", s ? s : ""); }
void TextFont(short font)                           { }
void TextSize(short size)                           { }
void TextMode(short mode)                           { }
void TextFace(short face)                           { }
void ForeColor(long color)                          { }
void BackColor(long color)                          { }
void RGBForeColor(const RGBColor *color)            { }
void RGBBackColor(const RGBColor *color)            { }
short GetPixelSize(PixMapHandle pm)                 { return 8; }
short StringWidth(const char *s)                    { return s ? (unsigned char)s[0] * 7 : 0; /* approx */ }
void  Move(short dh, short dv)                      { }

void NumToString(long theNum, char *theString) {
    if (!theString) return;
    /* Pascal string: first byte is length */
    char buf[32];
    snprintf(buf, sizeof(buf), "%ld", theNum);
    theString[0] = (char)strlen(buf);
    memcpy(theString + 1, buf, (size_t)theString[0]);
}

long StringToNum(const char *theString, long *theNum) {
    if (!theString || !theString[0]) { if (theNum) *theNum = 0; return 0; }
    char buf[256];
    int len = (unsigned char)theString[0];
    memcpy(buf, theString + 1, len);
    buf[len] = 0;
    long val = atol(buf);
    if (theNum) *theNum = val;
    return val;
}

void UpperString(char *theString, Boolean diacSensitive) {
    if (!theString) return;
    int len = (unsigned char)theString[0];
    for (int i = 1; i <= len; i++)
        theString[i] = (char)toupper((unsigned char)theString[i]);
}

/* GetScreenGW is implemented in screen.c */

void GetQDGlobalsBlack(Pattern *black) {
    if (black) memset(black, 0xFF, sizeof(Pattern));
}

RgnHandle NewRgn(void) {
    return (RgnHandle)calloc(1, sizeof(Region));
}

void DisposeRgn(RgnHandle rgn) {
    free(rgn);
}

void RectRgn(RgnHandle rgn, const Rect *r)                               { }
void SetRectRgn(RgnHandle rgn, short l, short t, short r, short b)       { }

RgnHandle GetGrayRgn(void) {
    static Region gGrayRgn;
    return &gGrayRgn;
}

void GetRegionBounds(RgnHandle rgn, Rect *bounds) {
    if (bounds) { bounds->left = 0; bounds->top = 0; bounds->right = 640; bounds->bottom = 480; }
}

/*---------------------------------------------------------------------------*/
/* Window Manager                                                            */
/*---------------------------------------------------------------------------*/

void InitCursor(void)  { printf("TODO: InitCursor\n"); }
void HideCursor(void)  { printf("TODO: HideCursor\n"); }
void ShowCursor(void)  { printf("TODO: ShowCursor\n"); }

void DragWindow(WindowPtr w, Point startPt, const Rect *boundsRect) {
    printf("TODO: DragWindow\n");
}

short FindWindow(Point pt, WindowPtr *which) {
    if (which) *which = NULL;
    return 0;
}

void HideWindow(WindowPtr w)   { printf("TODO: HideWindow\n"); }
void ShowWindow(WindowPtr w)   { printf("TODO: ShowWindow\n"); }
void SelectWindow(WindowPtr w) { printf("TODO: SelectWindow\n"); }

/*---------------------------------------------------------------------------*/
/* Dialog Manager                                                            */
/*---------------------------------------------------------------------------*/

DialogPtr GetNewDialog(short id, void *wStorage, WindowPtr behind) {
    printf("TODO: GetNewDialog(%d)\n", id);
    return (DialogPtr)calloc(1, sizeof(OpaqueDialogPtr));
}

void DisposeDialog(DialogPtr dialog) {
    if (dialog) free(dialog);
}

void ModalDialog(void *filterProc, short *itemHit) {
    printf("TODO: ModalDialog\n");
    if (itemHit) *itemHit = 1;
}

void GetDialogItem(DialogPtr dialog, short itemNo, short *itemType,
                    Handle *item, Rect *box) {
    if (itemType) *itemType = 0;
    if (item)     *item     = NULL;
    if (box)      memset(box, 0, sizeof(Rect));
}

void SetDialogItemText(Handle item, const char *text) { }
void GetDialogItemText(Handle item, char *text) {
    if (text) text[0] = 0;
}

OSErr SetDialogDefaultItem(DialogPtr dialog, short newItem) { return 0; }
OSErr SetDialogCancelItem(DialogPtr dialog, short newItem)  { return 0; }

OSErr GetDialogItemAsControl(DialogPtr dialog, short itemNo, ControlHandle *control) {
    if (control) *control = (ControlHandle)calloc(1, sizeof(Ptr));
    return 0;
}

void  SetControlValue(ControlHandle c, short v)            { }
short GetControlValue(ControlHandle c)                     { return 0; }
OSErr HiliteControl(ControlHandle c, short s)              { return 0; }
OSErr DeactivateControl(ControlHandle c)                   { return 0; }
OSErr ActivateControl(ControlHandle c)                     { return 0; }

OSErr CountSubControls(ControlHandle inControl, UInt16 *outNumChildren) {
    if (outNumChildren) *outNumChildren = 0;
    return 0;
}

OSErr GetIndexedSubControl(ControlHandle inControl, UInt16 inIndex, ControlHandle *outSubControl) {
    if (outSubControl) *outSubControl = NULL;
    return 0;
}

/*---------------------------------------------------------------------------*/
/* Notification / Alert                                                      */
/*---------------------------------------------------------------------------*/

OSErr StandardAlert(AlertType alertType, const char *error, const char *explanation,
                     const AlertStdAlertParamRec *param, short *itemHit) {
    const char *typeStr = "Alert";
    if (alertType == 0)      typeStr = "STOP";
    else if (alertType == 1) typeStr = "NOTE";
    else if (alertType == 2) typeStr = "CAUTION";
    printf("[%s] %s\n       %s\n", typeStr,
           error ? error : "", explanation ? explanation : "");
    if (itemHit) *itemHit = 1;
    return 0;
}

short StopAlert(short alertID, void *filterProc) {
    printf("[StopAlert %d]\n", alertID);
    return 1;
}

/*---------------------------------------------------------------------------*/
/* Appearance Manager                                                        */
/*---------------------------------------------------------------------------*/

OSErr RegisterAppearanceClient(void) {
    printf("TODO: RegisterAppearanceClient\n");
    return 0;
}

/*---------------------------------------------------------------------------*/
/* Apple Events                                                              */
/*---------------------------------------------------------------------------*/

OSErr AEInstallEventHandler(AEEventClass eventClass, AEEventID eventID,
                              AEEventHandlerUPP handler, long handlerRefcon,
                              Boolean isSysHandler) {
    return 0;
}

OSErr AEGetParamDesc(const AppleEvent *theAppleEvent, AEKeyword theAEKeyword,
                      DescType desiredType, AEDesc *result) {
    if (result) memset(result, 0, sizeof(AEDesc));
    return -1701; /* errAEDescNotFound */
}

OSErr AEGetAttributePtr(const AppleEvent *theAppleEvent, AEKeyword theAEKeyword,
                          DescType desiredType, DescType *typeCode, void *dataPtr,
                          Size maximumSize, Size *actualSize) {
    if (theAEKeyword == 'miss') return -1701; /* errAEDescNotFound = not found is success */
    return -1701;
}

OSErr AECountItems(const AEDescList *theAEDescList, long *theCount) {
    if (theCount) *theCount = 0;
    return 0;
}

OSErr AEGetNthPtr(const AEDescList *theAEDescList, long index, DescType desiredType,
                   AEKeyword *theAEKeyword, DescType *typeCode, void *dataPtr,
                   Size maximumSize, Size *actualSize) {
    return -1701;
}

OSErr AEDisposeDesc(AEDesc *theAEDesc) {
    return 0;
}

/*---------------------------------------------------------------------------*/
/* System calls                                                              */
/*---------------------------------------------------------------------------*/

OSErr Gestalt(OSType selector, long *response) {
    if (!response) return -50;
    if (selector == 'sysv') { *response = 0x00001050; return 0; } /* fake OS X 10.5 */
    if (selector == 'pclk') { *response = 1000000000; return 0; } /* 1GHz */
    *response = 0;
    return 0;
}

void ExitToShell(void) {
    printf("[ExitToShell]\n");
    exit(0);
}

void DebugStr(const char *debuggerMsg) {
    printf("[DebugStr] %s\n", debuggerMsg ? debuggerMsg : "");
}

Boolean WaitNextEvent(short eventMask, EventRecord *theEvent, long sleep, void *mouseRgn) {
    if (theEvent) {
        memset(theEvent, 0, sizeof(EventRecord));
        theEvent->what = 0; /* nullEvent */
    }
    return 0;
}

void FlushEvents(short eventMask, short stopMask) { }

OSErr AEProcessAppleEvent(const EventRecord *theEventRecord) { return 0; }

Boolean IsDialogEvent(const EventRecord *theEvent) { return 0; }

Boolean DialogSelect(const EventRecord *theEvent, DialogPtr *theDialog, short *itemHit) {
    if (itemHit) *itemHit = 0;
    if (theDialog) *theDialog = NULL;
    return 0;
}

Boolean Button(void) { return 0; }

void GetKeys(KeyMap theKeys) {
    if (theKeys) memset(theKeys, 0, sizeof(UInt32) * 4);
}

void TEFromScrap(void) { }

/*---------------------------------------------------------------------------*/
/* Sound Manager                                                             */
/*---------------------------------------------------------------------------*/

OSErr SndNewChannel(SndChannelPtr *chan, short synth, long init,
                     SndCallBackProcPtr userRoutine) {
    printf("TODO: SndNewChannel\n");
    if (!chan) return -50;
    *chan = (SndChannelPtr)calloc(1, sizeof(SndChannel));
    if (!*chan) return -108;
    (*chan)->callBack = userRoutine;
    return 0;
}

OSErr SndDisposeChannel(SndChannelPtr chan, Boolean quietNow) {
    printf("TODO: SndDisposeChannel\n");
    if (chan) free(chan);
    return 0;
}

OSErr SndDoImmediate(SndChannelPtr chan, const SndCommand *cmd) { return 0; }
OSErr SndDoCommand(SndChannelPtr chan, const SndCommand *cmd, Boolean noWait) { return 0; }

OSErr SndChannelStatus(SndChannelPtr chan, short theLength, SCStatusPtr theStatus) {
    if (theStatus) memset(theStatus, 0, theLength);
    return 0;
}

NumVersion SndSoundManagerVersion(void) {
    NumVersion v = { 0, 0, 0, 4 }; /* Fake version 4 */
    return v;
}

OSErr GetSoundOutputInfo(ComponentInstance ci, OSType selector, void *infoPtr) {
    printf("TODO: GetSoundOutputInfo\n");
    if (selector == 'srat' && infoPtr) *(long*)infoPtr = 0x56220000; /* rate22050hz */
    return 0;
}

OSErr SetSoundOutputInfo(ComponentInstance ci, OSType selector, void *infoPtr) {
    printf("TODO: SetSoundOutputInfo\n");
    return 0;
}

Component FindNextComponent(Component aComponent, ComponentDescription *looking) {
    printf("TODO: FindNextComponent\n");
    return NULL;
}
