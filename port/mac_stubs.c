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

/*
 * Handle implementation: prefix each data block with its size so that
 * GetHandleSize() returns the exact requested size (not malloc's usable size).
 *
 * Memory layout: [ Size prefix ] [ data ... ]
 *                               ^
 *                           *handle points here
 */
#define HSIZE_PREFIX sizeof(Size)

Handle NewHandle(Size s)
{
    char *block;
    Ptr  *h;
    if (s < 0) s = 0;
    block = (char *)malloc(HSIZE_PREFIX + (s ? (size_t)s : 1));
    if (!block) return NULL;
    *(Size*)block = s;
    h = (Ptr *)malloc(sizeof(Ptr));
    if (!h) { free(block); return NULL; }
    *h = block + HSIZE_PREFIX;
    return (Handle)h;
}

Handle NewHandleClear(Size s)
{
    Handle h = NewHandle(s);
    if (h && *h && s) memset(*h, 0, (size_t)s);
    return h;
}

Handle NewHandleSys(Size s) { return NewHandle(s); }

Size GetHandleSize(Handle h)
{
    if (!h || !*h) return 0;
    return *(Size*)(*h - HSIZE_PREFIX);
}

void SetHandleSize(Handle h, Size newSize)
{
    char *block, *newBlock;
    if (!h || !*h) return;
    block    = *h - HSIZE_PREFIX;
    newBlock = (char *)realloc(block, HSIZE_PREFIX + (newSize ? (size_t)newSize : 1));
    if (!newBlock) return;
    *(Size*)newBlock = newSize;
    *h = newBlock + HSIZE_PREFIX;
}

void DisposeHandle(Handle h)
{
    if (!h) return;
    if (*h) free(*h - HSIZE_PREFIX);
    *h = NULL;
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
/* File Manager - POSIX-backed implementation                                */
/*---------------------------------------------------------------------------*/

#include <unistd.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <errno.h>

/* Map Mac FSRef numbers to POSIX file descriptors (simple array) */
#define MAX_OPEN_FILES 32
static int s_file_fds[MAX_OPEN_FILES];  /* POSIX file descriptors, or -1 if closed */
static int s_files_initialized = 0;

static void init_file_table(void) {
    if (!s_files_initialized) {
        int i;
        for (i = 0; i < MAX_OPEN_FILES; i++) s_file_fds[i] = -1;
        s_files_initialized = 1;
    }
}

static short alloc_refnum(int fd) {
    int i;
    init_file_table();
    for (i = 1; i < MAX_OPEN_FILES; i++) {
        if (s_file_fds[i] == -1) {
            s_file_fds[i] = fd;
            return (short)i;
        }
    }
    return -1; /* no slots */
}

/* Get platform-specific preferences directory */
static const char *get_prefs_dir(void) {
#ifdef __EMSCRIPTEN__
    /* Emscripten: use IDBFS-mounted /prefs */
    return "/prefs";
#else
    /* Linux/macOS: use $HOME/.reckless_drivin */
    static char dir[512] = {0};
    if (!dir[0]) {
        const char *home = getenv("HOME");
        if (!home) home = "/tmp";
        snprintf(dir, sizeof(dir), "%s/.reckless_drivin", home);
    }
    return dir;
#endif
}

static void ensure_prefs_dir(void) {
    const char *d = get_prefs_dir();
    struct stat st;
    if (stat(d, &st) != 0) {
        mkdir(d, 0755);
    }
}

OSErr FSMakeFSSpec(short vRefNum, long dirID, const char *cName, FSSpec *spec) {
    if (!spec) return -50;
    spec->vRefNum = vRefNum;
    spec->parID   = dirID;
    if (cName) {
        strncpy(spec->name, cName, 255);
        spec->name[255] = '\0';
    } else {
        spec->name[0] = 0;
    }
    return 0;
}

/* Build POSIX path from FSSpec; puts result in buf (must be at least 512 bytes) */
static void fsspec_to_path(const FSSpec *spec, char *buf, size_t bufsz) {
    const char *dir = get_prefs_dir();
    const char *name = spec->name;
    /* Skip leading Pascal string length byte if present (heuristic) */
    if (name[0] > 0 && name[0] < 32 &&
        (unsigned char)name[0] == strlen(name+1)) {
        name++; /* Pascal string: first byte is length */
    }
    snprintf(buf, bufsz, "%s/%s", dir, name);
}

short FSpOpenResFile(const FSSpec *spec, char permission) {
    /* Resource files are handled by resources.c, not this path */
    return -1;
}

OSErr FSpOpenDF(const FSSpec *spec, char permission, short *refNum) {
    char path[512];
    int posix_flags, fd;
    if (!spec || !refNum) return -50;
    fsspec_to_path(spec, path, sizeof(path));
    posix_flags = (permission == 1/*fsRdPerm*/) ? O_RDONLY
                : (permission == 2/*fsWrPerm*/) ? O_WRONLY|O_CREAT
                :                                  O_RDWR|O_CREAT;
    fd = open(path, posix_flags, 0644);
    if (fd < 0) {
        *refNum = -1;
        return -43; /* fnfErr */
    }
    *refNum = alloc_refnum(fd);
    if (*refNum < 0) { close(fd); return -108; }
    return 0;
}

OSErr FSpOpenRF(const FSSpec *spec, char permission, short *refNum) {
    if (refNum) *refNum = -1;
    return -43;
}

OSErr FSOpen(const char *cName, short vRefNum, short *refNum) {
    int fd;
    if (!cName || !refNum) return -50;
    fd = open(cName, O_RDWR|O_CREAT, 0644);
    if (fd < 0) { *refNum = -1; return -43; }
    *refNum = alloc_refnum(fd);
    if (*refNum < 0) { close(fd); return -108; }
    return 0;
}

short OpenResFile(const char *cName) {
    return -1; /* resource files handled separately */
}

OSErr FSpCreate(const FSSpec *spec, OSType creator, OSType fileType, short scriptTag) {
    char path[512];
    int fd;
    if (!spec) return -50;
    ensure_prefs_dir();
    fsspec_to_path(spec, path, sizeof(path));
    fd = open(path, O_WRONLY|O_CREAT|O_TRUNC, 0644);
    if (fd >= 0) close(fd);
    return (fd >= 0) ? 0 : -43;
}

OSErr FSpDelete(const FSSpec *spec) {
    char path[512];
    if (!spec) return -50;
    fsspec_to_path(spec, path, sizeof(path));
    return (remove(path) == 0) ? 0 : -43;
}

OSErr FindFolder(short vRefNum, OSType folderType, Boolean createFolder,
                  short *foundVRefNum, long *foundDirID) {
    if (foundVRefNum) *foundVRefNum = 0;
    if (foundDirID)   *foundDirID   = 0;
    if (createFolder) ensure_prefs_dir();
    return 0;
}

OSErr FSRead(short refNum, long *count, Ptr buffPtr) {
    int fd;
    ssize_t n;
    if (!count || !buffPtr || refNum < 0 || refNum >= MAX_OPEN_FILES) return -50;
    fd = s_file_fds[refNum];
    if (fd < 0) return -38; /* fnOpnErr */
    n = read(fd, buffPtr, (size_t)*count);
    if (n < 0) { *count = 0; return -36; }
    *count = (long)n;
    return (n == 0) ? -39 /*eofErr*/ : 0;
}

OSErr FSWrite(short refNum, long *count, Ptr buffPtr) {
    int fd;
    ssize_t n;
    if (!count || !buffPtr || refNum < 0 || refNum >= MAX_OPEN_FILES) return -50;
    fd = s_file_fds[refNum];
    if (fd < 0) return -38;
    n = write(fd, buffPtr, (size_t)*count);
    if (n < 0) return -36;
    *count = (long)n;
    return 0;
}

OSErr FSClose(short refNum) {
    int fd;
    if (refNum < 0 || refNum >= MAX_OPEN_FILES) return -50;
    fd = s_file_fds[refNum];
    if (fd < 0) return -38;
    close(fd);
    s_file_fds[refNum] = -1;
    return 0;
}

OSErr GetEOF(short refNum, long *logEOF) {
    int fd;
    struct stat st;
    if (!logEOF || refNum < 0 || refNum >= MAX_OPEN_FILES) return -50;
    fd = s_file_fds[refNum];
    if (fd < 0) return -38;
    if (fstat(fd, &st) != 0) return -36;
    *logEOF = (long)st.st_size;
    return 0;
}

OSErr SetEOF(short refNum, long logEOF) {
    int fd;
    if (refNum < 0 || refNum >= MAX_OPEN_FILES) return -50;
    fd = s_file_fds[refNum];
    if (fd < 0) return -38;
    return (ftruncate(fd, (off_t)logEOF) == 0) ? 0 : -36;
}

OSErr GetFPos(short refNum, long *curPos) {
    int fd;
    off_t pos;
    if (!curPos || refNum < 0 || refNum >= MAX_OPEN_FILES) return -50;
    fd = s_file_fds[refNum];
    if (fd < 0) return -38;
    pos = lseek(fd, 0, SEEK_CUR);
    if (pos < 0) return -36;
    *curPos = (long)pos;
    return 0;
}

OSErr SetFPos(short refNum, short posMode, long posOff) {
    int fd, whence;
    if (refNum < 0 || refNum >= MAX_OPEN_FILES) return -50;
    fd = s_file_fds[refNum];
    if (fd < 0) return -38;
    whence = (posMode == 1/*fsFromStart*/) ? SEEK_SET
           : (posMode == 3/*fsFromLEOF*/)  ? SEEK_END
           :                                  SEEK_CUR; /* fsFromMark */
    return (lseek(fd, (off_t)posOff, whence) >= 0) ? 0 : -36;
}

/*---------------------------------------------------------------------------*/
/* Time Manager                                                              */
/*---------------------------------------------------------------------------*/

void GetDateTime(unsigned long *secs) {
    if (secs) *secs = (unsigned long)time(NULL);
}

#ifndef PORT_SDL2
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
#endif /* !PORT_SDL2 */

/* GetMSTime is implemented in source/input.c or sdl_platform.c */

/*---------------------------------------------------------------------------*/
/* Time functions (Mach/HW timer stubs)                                      */
/*---------------------------------------------------------------------------*/

#ifndef PORT_SDL2
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
#endif /* !PORT_SDL2 */

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

static GWorldPtr gCurrentGWorld = NULL;

void GetGWorld(GWorldPtr *port, GDHandle *gdh) {
    if (port) *port = gCurrentGWorld;
    if (gdh)  *gdh  = NULL;
}

void SetGWorld(GWorldPtr port, GDHandle gdh) {
    gCurrentGWorld = port;
}

/*
 * GWorld implementation:
 * We use a simple struct that holds a pixel buffer and PixMap.
 * The PixMap is embedded so GetGWorldPixMap works correctly.
 */
typedef struct {
    PixMap  pixmap;     /* Must be first member */
    UInt8  *pixels;     /* Allocated pixel data */
    int     owned;      /* Whether we own 'pixels' */
} GWorldImpl;

OSErr NewGWorld(GWorldPtr *offscreenGWorld, short pixelDepth, const Rect *boundsRect,
                 CTabHandle cTable, GDHandle aGDevice, UInt32 flags) {
    GWorldImpl *gw;
    int w, h, bpp;
    if (!offscreenGWorld || !boundsRect) return -50;

    gw = (GWorldImpl *)calloc(1, sizeof(GWorldImpl));
    if (!gw) return -108;

    w = boundsRect->right  - boundsRect->left;
    h = boundsRect->bottom - boundsRect->top;
    bpp = (pixelDepth == 16) ? 2 : (pixelDepth == 32) ? 4 : 1;

    gw->pixels = (UInt8 *)calloc(1, (size_t)(w * h * bpp) + 16);
    if (!gw->pixels) { free(gw); return -108; }
    gw->owned = 1;

    /* Set up PixMap */
    gw->pixmap.baseAddr  = (Ptr)gw->pixels;
    gw->pixmap.rowBytes  = (short)(w * bpp) | 0x8000; /* set high bit = PixMap */
    gw->pixmap.bounds    = *boundsRect;
    gw->pixmap.pixelSize = pixelDepth ? pixelDepth : 8;
    gw->pixmap.cmpCount  = (pixelDepth == 16 || pixelDepth == 32) ? 3 : 1;
    gw->pixmap.cmpSize   = (pixelDepth == 16) ? 5 : (pixelDepth == 32) ? 8 : 8;
    gw->pixmap.pmTable   = (Handle)cTable;

    *offscreenGWorld = (GWorldPtr)gw;
    return 0;
}

void DisposeGWorld(GWorldPtr offscreenGWorld) {
    if (offscreenGWorld) {
        GWorldImpl *gw = (GWorldImpl *)offscreenGWorld;
        if (gw->owned && gw->pixels) free(gw->pixels);
        free(gw);
    }
}

PixMapHandle GetGWorldPixMap(GWorldPtr offscreenGWorld) {
    if (!offscreenGWorld) return NULL;
    /* The PixMap is the first member of GWorldImpl, so the ptr IS the PixMapPtr */
    static PixMap *s_pm_ptr;
    s_pm_ptr = &((GWorldImpl *)offscreenGWorld)->pixmap;
    return (PixMapHandle)&s_pm_ptr;
}

Ptr GetPixBaseAddr(PixMapHandle pm) {
    if (!pm || !*pm) return NULL;
    return (*pm)->baseAddr;
}

Boolean LockPixels(PixMapHandle pm) { return 1; }
/* UnlockPixels is defined as static inline in mac_compat.h */

CTabHandle GetCTable(short ctID) {
    /* Try to load from resources (game has 'clut' or 'Cl16' resources) */
    Handle h = Pomme_GetResource('clut', ctID);
    if (!h) {
        /* Create a simple grayscale color table as fallback */
        Size sz = sizeof(ColorTable) + sizeof(ColorSpec) * 255;
        CTabHandle ct = (CTabHandle)NewHandle(sz);
        if (!ct) return NULL;
        {
            int i;
            ColorTable *tbl = *ct;
            tbl->ctSeed  = 0;
            tbl->ctFlags = 0;
            tbl->ctSize  = 255;
            for (i = 0; i < 256; i++) {
                tbl->ctTable[i].value = (short)i;
                tbl->ctTable[i].rgb.red   = (UInt16)((i * 257) & 0xFFFF);
                tbl->ctTable[i].rgb.green = (UInt16)((i * 257) & 0xFFFF);
                tbl->ctTable[i].rgb.blue  = (UInt16)((i * 257) & 0xFFFF);
            }
        }
        return ct;
    }
    /* The resource data IS the ColorTable struct; return it as a handle */
    return (CTabHandle)h;
}

void DisposeCTable(CTabHandle ctab) {
    if (ctab) DisposeHandle((Handle)ctab);
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

#ifndef PORT_SDL2
Boolean StillDown(void) { return 0; }
#endif

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

OSErr Gestalt(OSType selector, SInt32 *response) {
    if (!response) return -50;
    if (selector == 'sysv') { *response = 0x00001050; return 0; } /* fake OS X 10.5 */
    if (selector == 'pclk') { *response = (SInt32)1000000000; return 0; } /* 1GHz */
    *response = 0;
    return 0;
}

#ifndef PORT_SDL2
void ExitToShell(void) {
    printf("[ExitToShell]\n");
    exit(0);
}
#endif

void DebugStr(const char *debuggerMsg) {
    printf("[DebugStr] %s\n", debuggerMsg ? debuggerMsg : "");
}

#ifndef PORT_SDL2
Boolean WaitNextEvent(short eventMask, EventRecord *theEvent, long sleep, void *mouseRgn) {
    if (theEvent) {
        memset(theEvent, 0, sizeof(EventRecord));
        theEvent->what = 0; /* nullEvent */
    }
    return 0;
}

void FlushEvents(short eventMask, short stopMask) { }
#endif /* !PORT_SDL2 */

OSErr AEProcessAppleEvent(const EventRecord *theEventRecord) { return 0; }

Boolean IsDialogEvent(const EventRecord *theEvent) { return 0; }

Boolean DialogSelect(const EventRecord *theEvent, DialogPtr *theDialog, short *itemHit) {
    if (itemHit) *itemHit = 0;
    if (theDialog) *theDialog = NULL;
    return 0;
}

#ifndef PORT_SDL2
Boolean Button(void) { return 0; }

void GetKeys(KeyMap theKeys) {
    if (theKeys) memset(theKeys, 0, sizeof(UInt32) * 4);
}
#endif /* !PORT_SDL2 */

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
    /* Return version 3.2 final (0x03200000) - must be > 0x03100000 to pass ReqCheck() */
    NumVersion v;
    v.majorRev    = 3;
    v.minorAndBugRev = 0x20; /* minor=2, bug=0 */
    v.stage       = 0x80;   /* final release */
    v.nonRelRev   = 0;
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
