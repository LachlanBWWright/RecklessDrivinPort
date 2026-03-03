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

/* Forward declarations for QuickDraw helpers used by DrawPicture */
static UInt8 *current_port_pixels(void);
static short  current_port_rowbytes(void);

/*---------------------------------------------------------------------------*/
/* Memory Manager                                                            */
/*---------------------------------------------------------------------------*/

/*
 * Handle implementation: prefix each data block with its size so that
 * GetHandleSize() returns the exact requested size (not malloc's usable size).
 *
 * Memory layout: [ uint32_t size (4 bytes) ] [ data ... ]
 *                                             ^
 *                           *handle points here
 *
 * We use a fixed 4-byte prefix (matching Mac OS Classic 32-bit memory model)
 * rather than sizeof(Size) which would be 8 on 64-bit platforms.
 */
#define HSIZE_PREFIX 4

Handle NewHandle(Size s)
{
    char *block;
    Ptr  *h;
    uint32_t sz;
    if (s < 0) s = 0;
    sz = (uint32_t)s;
    block = (char *)malloc(HSIZE_PREFIX + (sz ? (size_t)sz : 1));
    if (!block) return NULL;
    *(uint32_t*)block = sz;
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
    return (Size)*(uint32_t*)(*h - HSIZE_PREFIX);
}

void SetHandleSize(Handle h, Size newSize)
{
    char *block, *newBlock;
    if (!h || !*h) return;
    block    = *h - HSIZE_PREFIX;
    newBlock = (char *)realloc(block, HSIZE_PREFIX + (newSize ? (size_t)newSize : 1));
    if (!newBlock) return;
    *(uint32_t*)newBlock = (uint32_t)newSize;
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
    /*
     * The game stores its colour table as a 'Cl16' resource: 256 big-endian
     * 16-bit values in xRRRRR GGGGG BBBBB (1-5-5-5) format.
     * Build a standard ColorTable from it.
     */
    Handle raw = Pomme_GetResource('Cl16', ctID);
    if (raw) {
        Size rawSz = GetHandleSize(raw);
        int nColors = (int)(rawSz / 2);  /* 2 bytes per 15-bit entry */
        if (nColors > 256) nColors = 256;
        {
            Size ctSz = (Size)(offsetof(ColorTable, ctTable) + sizeof(ColorSpec) * nColors);
            CTabHandle ct = (CTabHandle)NewHandle(ctSz);
            if (ct) {
                int i;
                ColorTable *tbl = *ct;
                tbl->ctSeed  = (SInt32)ctID;
                tbl->ctFlags = 0;
                tbl->ctSize  = (short)(nColors - 1);
                for (i = 0; i < nColors; i++) {
                    /* Big-endian 16-bit: bit15=unused, bits14-10=R, bits9-5=G, bits4-0=B */
                    const uint8_t *b = (const uint8_t *)(*raw) + i * 2;
                    uint16_t v = (uint16_t)(((uint16_t)b[0] << 8) | b[1]);
                    uint8_t r5 = (uint8_t)((v >> 10) & 0x1F);
                    uint8_t g5 = (uint8_t)((v >>  5) & 0x1F);
                    uint8_t b5 = (uint8_t)( v        & 0x1F);
                    /* Scale 5-bit → 8-bit → 16-bit (so >> 8 gives correct 8-bit) */
                    uint8_t r8 = (uint8_t)((r5 * 255u + 15u) / 31u);
                    uint8_t g8 = (uint8_t)((g5 * 255u + 15u) / 31u);
                    uint8_t b8 = (uint8_t)((b5 * 255u + 15u) / 31u);
                    tbl->ctTable[i].value     = (short)i;
                    tbl->ctTable[i].rgb.red   = (UInt16)(r8 * 257u);
                    tbl->ctTable[i].rgb.green = (UInt16)(g8 * 257u);
                    tbl->ctTable[i].rgb.blue  = (UInt16)(b8 * 257u);
                }
            }
            DisposeHandle(raw);
            return ct;
        }
    }

    /* Try legacy 'clut' resource (big-endian Mac ColorTable struct) */
    {
        Handle h = Pomme_GetResource('clut', ctID);
        if (h) {
            int i;
            ColorTable *tbl = *(CTabHandle)h;
            tbl->ctSeed  = (SInt32)be32_swap((uint32_t)tbl->ctSeed);
            tbl->ctFlags = (SInt16)be16_swap((uint16_t)tbl->ctFlags);
            tbl->ctSize  = (SInt16)be16_swap((uint16_t)tbl->ctSize);
            for (i = 0; i <= (int)tbl->ctSize && i < 256; i++) {
                tbl->ctTable[i].value     = (SInt16)be16_swap((uint16_t)tbl->ctTable[i].value);
                tbl->ctTable[i].rgb.red   = be16_swap(tbl->ctTable[i].rgb.red);
                tbl->ctTable[i].rgb.green = be16_swap(tbl->ctTable[i].rgb.green);
                tbl->ctTable[i].rgb.blue  = be16_swap(tbl->ctTable[i].rgb.blue);
            }
            return (CTabHandle)h;
        }
    }

    /* Last resort: grayscale color table */
    {
        Size sz = (Size)(offsetof(ColorTable, ctTable) + sizeof(ColorSpec) * 256);
        CTabHandle ct = (CTabHandle)NewHandle(sz);
        if (!ct) return NULL;
        {
            int i;
            ColorTable *tbl = *ct;
            tbl->ctSeed  = 0;
            tbl->ctFlags = 0;
            tbl->ctSize  = 255;
            for (i = 0; i < 256; i++) {
                tbl->ctTable[i].value     = (short)i;
                tbl->ctTable[i].rgb.red   = (UInt16)(i * 257u);
                tbl->ctTable[i].rgb.green = (UInt16)(i * 257u);
                tbl->ctTable[i].rgb.blue  = (UInt16)(i * 257u);
            }
        }
        return ct;
    }
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

/* Helper: get pixel buffer and rowbytes from a GWorldPtr */
static UInt8 *gw_pixels(GWorldPtr gw) {
    extern Ptr gBaseAddr;
    if (!gw) return (UInt8 *)gBaseAddr;
    return ((GWorldImpl *)gw)->pixels;
}

static short gw_rowbytes(GWorldPtr gw) {
    extern short gRowBytes;
    if (!gw) return gRowBytes;
    return (short)(((GWorldImpl *)gw)->pixmap.rowBytes & 0x3FFF);
}

void CopyBits(const BitMap *srcBits, const BitMap *dstBits,
               const Rect *srcRect, const Rect *dstRect,
               short mode, void *maskRgn) {
    /* Simple 8-bit/pixel copy between Mac BitMaps (no scaling, no mode effects) */
    int srcX, srcY, dstX, dstY, w, h;
    int srcRB, dstRB;
    const UInt8 *src;
    UInt8 *dst;
    int y;

    if (!srcBits || !dstBits || !srcRect || !dstRect) return;

    srcRB = srcBits->rowBytes & 0x3FFF;
    dstRB = dstBits->rowBytes & 0x3FFF;
    src = (const UInt8 *)srcBits->baseAddr;
    dst = (UInt8 *)dstBits->baseAddr;
    if (!src || !dst || !srcRB || !dstRB) return;

    srcX = srcRect->left; srcY = srcRect->top;
    dstX = dstRect->left; dstY = dstRect->top;
    w = srcRect->right - srcRect->left;
    h = srcRect->bottom - srcRect->top;
    if (w <= 0 || h <= 0) return;

    for (y = 0; y < h; y++) {
        const UInt8 *srow = src + (srcY + y) * srcRB + srcX;
        UInt8 *drow = dst + (dstY + y) * dstRB + dstX;
        memcpy(drow, srow, (size_t)w);
    }
}

const BitMap *GetPortBitMapForCopyBits(GWorldPtr port) {
    /* Return a static BitMap pointing at the GWorld (or screen) pixel buffer */
    static BitMap bm;
    extern Ptr gBaseAddr;
    extern short gRowBytes;
    extern short gXSize, gYSize;
    if (!port) {
        bm.baseAddr = gBaseAddr;
        bm.rowBytes = gRowBytes;
        bm.bounds.left = 0; bm.bounds.top = 0;
        bm.bounds.right = gXSize; bm.bounds.bottom = gYSize;
    } else {
        GWorldImpl *gw = (GWorldImpl *)port;
        bm.baseAddr = (Ptr)gw->pixels;
        bm.rowBytes = (short)(gw->pixmap.rowBytes & 0x3FFF);
        bm.bounds = gw->pixmap.bounds;
    }
    return &bm;
}

void GetPortBounds(GWorldPtr port, Rect *bounds) {
    extern short gXSize, gYSize;
    if (!bounds) return;
    if (port) {
        GWorldImpl *gw = (GWorldImpl *)port;
        *bounds = gw->pixmap.bounds;
    } else {
        bounds->left = 0; bounds->top = 0;
        bounds->right = gXSize; bounds->bottom = gYSize;
    }
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

/*
 * unpack_bits - Decode one PackBits-compressed row into dst[width] bytes.
 * Returns number of compressed bytes consumed.
 */
static int unpack_bits(const UInt8 *src, UInt8 *dst, int width) {
    const UInt8 *s = src;
    UInt8 *d = dst;
    UInt8 *end = dst + width;
    while (d < end) {
        int flagbyte = (int)(SInt8)*s++;
        if (flagbyte >= 0) {
            /* (flagbyte+1) literal bytes */
            int n = flagbyte + 1;
            while (n-- > 0 && d < end) *d++ = *s++;
        } else if (flagbyte != -128) {
            /* Repeat next byte (-flagbyte+1) times */
            int n = -flagbyte + 1;
            UInt8 b = *s++;
            while (n-- > 0 && d < end) *d++ = b;
        }
        /* flagbyte == -128: NOP */
    }
    return (int)(s - src);
}

/*
 * rgb15_to_palette8 - Convert a 15-bit xRRRRRGGGGGBBBBB pixel to the nearest
 * 8-bit palette index using the supplied palette (SDL_Color array of 256).
 */
#ifdef PORT_SDL2
#include <SDL2/SDL.h>
extern SDL_Color s_palette[256];
static UInt8 rgb15_to_palette8(uint16_t px15, const SDL_Color *pal) {
    int r = ((px15 >> 10) & 0x1F) * 255 / 31;
    int g = ((px15 >>  5) & 0x1F) * 255 / 31;
    int b = ( px15        & 0x1F) * 255 / 31;
    int best = 0, bestDist = 0x7FFFFFFF, i;
    for (i = 0; i < 256; i++) {
        int dr = r - pal[i].r, dg = g - pal[i].g, db = b - pal[i].b;
        int dist = dr*dr + dg*dg + db*db;
        if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return (UInt8)best;
}
#endif

/*
 * DrawPicture - decode a Mac PICT (PPic resource) into the current GWorld.
 *
 * The game's PPic resources are LZRW-compressed Mac PICT v2 images.
 * Resources.dat was built from the hi-colour version of the game; all PPic
 * images are 16-bit (15-bit packed x5R5G5B) stored using PackBits compression
 * with a 2-byte byteCount prefix per row.
 *
 * Header layout (for 640x480 images):
 *   Bytes 0-9:   PICT size(2) + bounding rect(8) [big-endian]
 *   Bytes 10-39: version opcodes + HeaderOp
 *   Bytes 40-149: LongComment + Clip region + PackBitsRgn placeholder
 *   Byte 150:   start of packed pixel rows: byteCount(2) + PackBits data
 *
 * Decoded row width is picW*2 bytes (2 bytes per pixel, 15-bit RGB).
 * We convert 16-bit → 8-bit palette index when writing to the 8-bit port.
 */
void DrawPicture(PicHandle myPicture, const Rect *dstRect) {
    const UInt8 *pict;
    int picW, picH, pixDataOff, picBpp, row;
    int16_t picTop, picLeft, picBottom, picRight;
    UInt8 *portPix;
    int portRb;
    UInt8 *rowBuf;
    extern short gXSize, gYSize;

    if (!myPicture || !*myPicture) {
        fprintf(stderr, "DrawPicture: null picture\n");
        return;
    }

    pict = (const UInt8 *)(*myPicture);

    /* Parse PICT bounds rect (big-endian SInt16: top, left, bottom, right) */
    picTop    = (int16_t)(((uint16_t)pict[2] << 8) | pict[3]);
    picLeft   = (int16_t)(((uint16_t)pict[4] << 8) | pict[5]);
    picBottom = (int16_t)(((uint16_t)pict[6] << 8) | pict[7]);
    picRight  = (int16_t)(((uint16_t)pict[8] << 8) | pict[9]);
    picW = picRight  - picLeft;
    picH = picBottom - picTop;

    if (picW <= 0 || picH <= 0 || picW > 4096 || picH > 4096) {
        fprintf(stderr, "DrawPicture: bad picture size %dx%d\n", picW, picH);
        return;
    }

    /*
     * Auto-detect pixel row width.  The PPic resources in resources.dat were
     * exported from the hi-colour build, so all images use 16-bit pixels
     * (rowBytes = picW * 2).  We first try the 16-bit row width; if that
     * overshoots, we fall back to 8-bit (picW).
     */
    {
        Size picSize = GetHandleSize((Handle)myPicture);
        /* Try pixel-data start at offset 150 (all 640x480 PPic) or 106 (PPic 1005) */
        static const int OFFSETS[] = { 150, 106, 80, 82, 84, 86, 88, 90, 92,
                                        94, 96, 98, 100, 102, 104, 108, 110,
                                       112, 114, 116, 118, 120, 122, 124, 126,
                                       128, 130, 132, 134, 136, 138, 140, 142,
                                       144, 146, 148, 152, 154, 156, 158, 160, -1 };
        /* Try each (startOffset, rowBytes) combination: 16-bit first */
        int depths[] = { 2, 1 };   /* bytes per pixel to try */
        int di, ci, found = 0;
        for (di = 0; di < 2 && !found; di++) {
            int bpp = depths[di];
            int rowBytes = picW * bpp;
            int bcBytes  = (rowBytes > 250) ? 2 : 1;
            for (ci = 0; OFFSETS[ci] >= 0 && !found; ci++) {
                int off = OFFSETS[ci];
                int ok = 1;
                int consumed = 0;
                for (int r = 0; r < picH && ok; r++) {
                    if (off + bcBytes > (int)picSize) { ok=0; break; }
                    int bc = (bcBytes==2) ?
                        (int)(((uint16_t)pict[off]<<8)|pict[off+1]) :
                        (int)pict[off];
                    if (bc <= 0 || bc > rowBytes + rowBytes/2 + 200) { ok=0; break; }
                    consumed += bcBytes + bc;
                    off      += bcBytes + bc;
                }
                if (ok && consumed > rowBytes * picH / 4) {
                    pixDataOff = OFFSETS[ci];
                    picBpp     = bpp;
                    found = 1;
                }
            }
        }
        if (!found) {
            fprintf(stderr, "DrawPicture: no pixel data found in PICT %dx%d\n", picW, picH);
            return;
        }
    }

    portPix = current_port_pixels();
    portRb  = current_port_rowbytes();
    if (!portPix || !portRb) return;

    /* Destination rectangle: use dstRect if provided, else PICT bounds */
    {
    int dstTop  = dstRect ? dstRect->top  : picTop;
    int dstLeft = dstRect ? dstRect->left : picLeft;
    int rowBytes = picW * picBpp;
    int bcBytes  = (rowBytes > 250) ? 2 : 1;

    rowBuf = (UInt8 *)malloc((size_t)rowBytes);
    if (!rowBuf) return;

    {
        const UInt8 *src = pict + pixDataOff;
        for (row = 0; row < picH; row++) {
            int dstY = dstTop + row;
            int bc;

            /* Read byteCount */
            bc = (bcBytes == 2) ?
                 (int)(((uint16_t)src[0] << 8) | src[1]) :
                 (int)src[0];
            src += bcBytes;

            /* Decode PackBits row into rowBuf (rowBytes of output) */
            memset(rowBuf, 0, (size_t)rowBytes);
            if (bc > 0) unpack_bits(src, rowBuf, rowBytes);
            src += bc;

            if (dstY < 0 || dstY >= gYSize) continue;

            if (picBpp == 1) {
                /* 8-bit indexed: copy palette indices directly */
                UInt8 *dst = portPix + dstY * portRb + dstLeft;
                int w = picW;
                if (dstLeft + w > gXSize) w = gXSize - dstLeft;
                if (w > 0 && dstLeft < gXSize) memcpy(dst, rowBuf, (size_t)w);
            } else {
                /* 16-bit x5R5G5B → 8-bit palette index via nearest-colour match */
#ifdef PORT_SDL2
                UInt8 *dst = portPix + dstY * portRb + dstLeft;
                int x;
                for (x = 0; x < picW && (dstLeft + x) < gXSize; x++) {
                    uint16_t px = (uint16_t)(((uint16_t)rowBuf[x*2] << 8)
                                            | rowBuf[x*2+1]);
                    dst[x] = rgb15_to_palette8(px, s_palette);
                }
#endif
            }
        }
    }

    free(rowBuf);
    } /* close dstTop/dstLeft block */
}

void KillPicture(PicHandle myPicture) {
}

/* QuickDraw current port pixel access helpers */
static UInt8 *current_port_pixels(void) {
    extern Ptr gBaseAddr;
    if (gCurrentGWorld) return gw_pixels(gCurrentGWorld);
    return (UInt8 *)gBaseAddr;
}

static short current_port_rowbytes(void) {
    extern short gRowBytes;
    if (gCurrentGWorld) return gw_rowbytes(gCurrentGWorld);
    return gRowBytes;
}

/* Current QuickDraw pen color (index into 8-bit palette) */
static UInt8 gQDForeColor = 0;   /* black = 0 */
static UInt8 gQDBackColor = 255; /* white = 255 */

static void fill_rect_color(const Rect *r, UInt8 color) {
    int x, y, x1, y1, x2, y2, rb;
    UInt8 *pix;
    extern short gXSize, gYSize;
    if (!r) return;
    pix = current_port_pixels();
    rb  = current_port_rowbytes();
    if (!pix || !rb) return;
    x1 = r->left; y1 = r->top; x2 = r->right; y2 = r->bottom;
    /* Clamp to pixel buffer bounds */
    if (x1 < 0) x1 = 0; if (y1 < 0) y1 = 0;
    if (x2 > gXSize) x2 = gXSize; if (y2 > gYSize) y2 = gYSize;
    if (x1 >= x2 || y1 >= y2) return;
    for (y = y1; y < y2; y++) {
        UInt8 *row = pix + y * rb + x1;
        for (x = x1; x < x2; x++) *row++ = color;
    }
}

void FillRect(const Rect *r, const Pattern *pat) {
    /* Use foreground color (pattern not implemented) */
    fill_rect_color(r, gQDForeColor);
}

void EraseRect(const Rect *r) {
    fill_rect_color(r, gQDBackColor);
}

void PaintRect(const Rect *r) {
    fill_rect_color(r, gQDForeColor);
}

void InvertRect(const Rect *r) {
    int x, y, x1, y1, x2, y2, rb;
    UInt8 *pix;
    if (!r) return;
    pix = current_port_pixels();
    rb  = current_port_rowbytes();
    if (!pix || !rb) return;
    x1 = r->left; y1 = r->top; x2 = r->right; y2 = r->bottom;
    if (x1 < 0) x1 = 0; if (y1 < 0) y1 = 0;
    for (y = y1; y < y2; y++) {
        UInt8 *row = pix + y * rb + x1;
        for (x = x1; x < x2; x++) *row++ ^= 0xFF;
    }
}

static void draw_hline(UInt8 *pix, int rb, int x1, int x2, int y, UInt8 color) {
    UInt8 *row;
    int x;
    extern short gXSize, gYSize;
    /* Bounds check */
    if (y < 0 || y >= gYSize) return;
    if (x1 < 0) x1 = 0;
    if (x2 > gXSize) x2 = gXSize;
    if (x1 >= x2) return;
    row = pix + y * rb + x1;
    for (x = x1; x < x2; x++) *row++ = color;
}

static void draw_vline(UInt8 *pix, int rb, int x, int y1, int y2, UInt8 color) {
    int y;
    extern short gXSize, gYSize;
    /* Bounds check */
    if (x < 0 || x >= gXSize) return;
    if (y1 < 0) y1 = 0;
    if (y2 > gYSize) y2 = gYSize;
    for (y = y1; y < y2; y++) pix[y * rb + x] = color;
}

void FrameRect(const Rect *r) {
    int x1, y1, x2, y2;
    UInt8 *pix = current_port_pixels();
    int rb = current_port_rowbytes();
    if (!r || !pix || !rb) return;
    x1 = r->left; y1 = r->top; x2 = r->right - 1; y2 = r->bottom - 1;
    if (x1 < 0) x1 = 0; if (y1 < 0) y1 = 0;
    draw_hline(pix, rb, x1, x2+1, y1, gQDForeColor);
    draw_hline(pix, rb, x1, x2+1, y2, gQDForeColor);
    draw_vline(pix, rb, x1, y1, y2+1, gQDForeColor);
    draw_vline(pix, rb, x2, y1, y2+1, gQDForeColor);
}
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
