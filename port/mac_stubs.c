/*
 * mac_stubs.c - Stub implementations of Mac OS 9 API functions
 *
 * These are minimal implementations to allow the game to compile.
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

/* QuickDraw state: suppress drawing while OpenRgn() / CloseRgn() is active */
static int gQDOpenRgn = 0;

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
    (void)refNum; /* no-op: resources are kept open for the lifetime of the process */
}

short Count1Resources(ResType t) {
    (void)t;
    return 0;
}

short Count1Types(void) {
    return 0;
}

Handle GetResource(ResType theType, short theID) {
    return Pomme_GetResource(theType, theID);
}

Handle Get1IndResource(ResType theType, short index) {
    (void)theType; (void)index;
    return NULL;
}

void GetResInfo(Handle res, short *theID, ResType *theType, char *name256) {
    (void)res;
    if (theID) *theID = 0;
    if (theType) *theType = 0;
    if (name256) name256[0] = 0;
}

void ReleaseResource(Handle res) {
    if (res) DisposeHandle(res);
}

void RemoveResource(Handle res)  { (void)res; }
void AddResource(Handle data, ResType type, short id, const char *name) { (void)data; (void)type; (void)id; (void)name; }
void ChangedResource(Handle res) { (void)res; }
void WriteResource(Handle res)   { (void)res; }
void DetachResource(Handle res)  { (void)res; }
long GetResourceSizeOnDisk(Handle res) { return GetHandleSize(res); }
long SizeResource(Handle res)          { return GetHandleSize(res); }
void SetResLoad(Boolean load)          { extern int g_res_load; g_res_load = load ? 1 : 0; }
Handle Get1Resource(ResType theType, short theID) {
    return Pomme_GetResource(theType, theID);
}

/*---------------------------------------------------------------------------*/
/* File Manager - POSIX-backed implementation                                */
/*---------------------------------------------------------------------------*/

#ifdef _WIN32
#include <io.h>
#include <direct.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <errno.h>
#define open   _open
#define close  _close
#define read   _read
#define write  _write
#define lseek  _lseek
#define fstat  _fstat
#define stat   _stat
#define ftruncate _chsize
typedef int ssize_t;
#else
#include <unistd.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <errno.h>
#endif

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
    static char dir[512] = {0};
    if (!dir[0]) {
#ifdef _WIN32
        const char *home = getenv("APPDATA");
        if (!home) home = getenv("USERPROFILE");
        if (!home) home = "C:\\Temp";
        snprintf(dir, sizeof(dir), "%s\\RecklessDrivin", home);
#else
        const char *home = getenv("HOME");
        if (!home) home = "/tmp";
        snprintf(dir, sizeof(dir), "%s/.reckless_drivin", home);
#endif
    }
    return dir;
#endif
}

static void ensure_prefs_dir(void) {
    const char *d = get_prefs_dir();
    struct stat st;
    if (stat(d, &st) != 0) {
#ifdef _WIN32
        _mkdir(d);
#else
        mkdir(d, 0755);
#endif
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
    (void)id;
    return NULL;
}

PicHandle OpenCPicture(const OpenCPicParams *newHeader) {
    (void)newHeader;
    PicHandle h = (PicHandle)NewHandle(sizeof(Picture));
    if (h) memset(*h, 0, sizeof(Picture));
    return h;
}

void ClosePicture(void) { }

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
    /* Return a BitMap pointing at the GWorld (or screen) pixel buffer.
     * We use a small pool of 4 static BitMaps so that back-to-back calls
     * (e.g. CopyBits(GetPortBitMapForCopyBits(src), GetPortBitMapForCopyBits(dst), …))
     * don't overwrite each other's result. */
    static BitMap pool[4];
    static int    pool_idx = 0;
    BitMap *bm = &pool[pool_idx & 3];
    pool_idx++;

    extern Ptr gBaseAddr;
    extern short gRowBytes;
    extern short gXSize, gYSize;
    if (!port) {
        bm->baseAddr = gBaseAddr;
        bm->rowBytes = gRowBytes;
        bm->bounds.left = 0; bm->bounds.top = 0;
        bm->bounds.right = gXSize; bm->bounds.bottom = gYSize;
    } else {
        GWorldImpl *gw = (GWorldImpl *)port;
        bm->baseAddr = (Ptr)gw->pixels;
        bm->rowBytes = (short)(gw->pixmap.rowBytes & 0x3FFF);
        bm->bounds = gw->pixmap.bounds;
    }
    return bm;
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
void OpenRgn(void)              { gQDOpenRgn++; }
void CloseRgn(RgnHandle dstRgn) { if (gQDOpenRgn > 0) gQDOpenRgn--; }
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
#ifdef _WIN32
    {
        /* Forward-declare Sleep to avoid pulling in <windows.h> which
           conflicts with Mac compat names (SetRect, LineTo, etc.) */
        __declspec(dllimport) void __stdcall Sleep(unsigned long);
        Sleep((unsigned long)(numTicks * 1000 / 60));
    }
#else
    struct timespec ts;
    ts.tv_sec  = numTicks / 60;
    ts.tv_nsec = (numTicks % 60) * 16666667L;
    nanosleep(&ts, NULL);
#endif
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
 * unpack_bits - Decode one 8-bit PackBits row (dstCap bytes of output).
 * Stops when input srcLen is exhausted OR dstCap bytes written.
 */
static int unpack_bits(const UInt8 *src, int srcLen, UInt8 *dst, int dstCap) {
    const UInt8 *s = src, *srcEnd = src + srcLen;
    UInt8 *d = dst, *end = dst + dstCap;
    while (d < end && s < srcEnd) {
        int flagbyte = (int)(SInt8)*s++;
        if (flagbyte >= 0) {
            int n = flagbyte + 1;
            while (n-- > 0 && d < end && s < srcEnd) *d++ = *s++;
        } else if (flagbyte != -128) {
            int n = -flagbyte + 1;
            if (s >= srcEnd) break;
            UInt8 b = *s++;
            while (n-- > 0 && d < end) *d++ = b;
        }
    }
    return (int)(d - dst);
}

/*
 * unpack_bits16 - Decode one 16-bit PackBits row (Mac PICT packType=3).
 * Tokens operate on 2-byte units.  Writes dstCap bytes of output.
 */
static int unpack_bits16(const UInt8 *src, int srcLen, UInt8 *dst, int dstCap) {
    const UInt8 *s = src, *srcEnd = src + srcLen;
    UInt8 *d = dst, *end = dst + dstCap;
    while (d + 1 < end && s < srcEnd) {
        int flagbyte = (int)(SInt8)*s++;
        if (flagbyte >= 0) {
            /* (flagbyte+1) literal 2-byte values */
            int n = flagbyte + 1;
            while (n-- > 0 && d + 1 < end && s + 1 < srcEnd) {
                *d++ = *s++; *d++ = *s++;
            }
        } else if (flagbyte != -128) {
            /* (-flagbyte+1) copies of next 2-byte value */
            int n = -flagbyte + 1;
            if (s + 1 >= srcEnd) break;
            UInt8 b0 = *s++, b1 = *s++;
            while (n-- > 0 && d + 1 < end) { *d++ = b0; *d++ = b1; }
        }
    }
    return (int)(d - dst);
}

/*
 * rgb15_to_palette8 - Convert a 15-bit xRRRRRGGGGGBBBBB pixel to the nearest
 * 8-bit palette index using a precomputed 32768-entry lookup table.
 *
 * There are only 32768 possible rgb15 values (2^15), so we precompute the
 * mapping once when the palette changes and store it in s_rgb15_cache.
 * This avoids 256 color-distance comparisons per pixel, making DrawPicture
 * ~256× faster (from ~100 seconds to under 1 second for a 640×480 image).
 */
#ifdef PORT_SDL2
#include <SDL2/SDL.h>
extern SDL_Color s_palette[256];

/* 32768-entry cache: rgb15 → palette index.  Invalidated by palette changes. */
static UInt8  s_rgb15_cache[32768];
static int    s_rgb15_cache_valid = 0;

/* Call this whenever s_palette changes to invalidate the cache. */
void rgb15_cache_invalidate(void) {
    s_rgb15_cache_valid = 0;
}

/* Build the full rgb15 → palette index lookup table (one-time per palette). */
static void rgb15_cache_build(const SDL_Color *pal) {
    int px;
    for (px = 0; px < 32768; px++) {
        int r = ((px >> 10) & 0x1F) * 255 / 31;
        int g = ((px >>  5) & 0x1F) * 255 / 31;
        int b = ( px        & 0x1F) * 255 / 31;
        int best = 0, bestDist = 0x7FFFFFFF, i;
        for (i = 0; i < 256; i++) {
            int dr = r - pal[i].r, dg = g - pal[i].g, db = b - pal[i].b;
            int dist = dr*dr + dg*dg + db*db;
            if (dist < bestDist) { bestDist = dist; best = i; }
        }
        s_rgb15_cache[px] = (UInt8)best;
    }
    s_rgb15_cache_valid = 1;
}

static UInt8 rgb15_to_palette8(uint16_t px15, const SDL_Color *pal) {
    if (!s_rgb15_cache_valid) rgb15_cache_build(pal);
    return s_rgb15_cache[px15 & 0x7FFF];
}
#endif


/*
 * pict_find_pixdata - Scan a PICT v2 byte stream for the start of the packed
 * pixel row data, using opcode-based parsing.
 *
 * PICT v2 structure:
 *   [0-1]   picSize   (uint16, may be 0 for large pictures)
 *   [2-9]   picFrame  (Rect: top,left,bottom,right as int16 big-endian)
 *   [10-11] opcode 0x0011 (VersionOp)
 *   [12-13] opcode 0x02FF (Version2)
 *   [14-15] opcode 0x0C00 (HeaderOp) — always has 24 bytes of data
 *   [40-41] opcode 0x001E (ClipRgn)
 *   [42-43] uint16 regionSize (bytes including these 2 bytes)
 *   [44 ..] clip region data (regionSize-2 bytes)
 *   [44+(regionSize-2) ..] pixel data opcode (0x009A = DirectBitsRect or 0x0098)
 *
 * The DirectBitsRect (0x009A) opcode data:
 *   4 bytes  baseAddr   (always 0x000000FF)
 *   2 bytes  rowBytes   (high bit set for PixMap)
 *   8 bytes  bounds     (Rect)
 *  34 bytes  remaining PixMap fields (pmVersion … pmReserved)
 *  ── total PixMap = 4+2+8+34 = 48 bytes ──
 *   8 bytes  srcRect
 *   8 bytes  dstRect
 *   2 bytes  mode
 * Pixel row data starts immediately after.
 *
 * Returns offset of first byteCount field on success, -1 on failure.
 * Sets *out_bpp to bytes-per-pixel (1 or 2), *out_rowbytes to bytes per row.
 */
static int pict_find_pixdata(const UInt8 *pict, int picSize,
                              int picW, int picH,
                              int *out_bpp, int *out_rowbytes)
{
    /* Minimum PICT v2 header: 10 (fixed) + 4 (version) + 26 (headerOp) = 40 bytes */
    if (picSize < 40) return -1;

    /* Verify version opcodes at [10..13] */
    if (pict[10] != 0x00 || pict[11] != 0x11) return -1;
    if (pict[12] != 0x02 || pict[13] != 0xFF) return -1;
    /* HeaderOp at [14..15] */
    if (pict[14] != 0x0C || pict[15] != 0x00) return -1;
    /* Skip 24 bytes of HeaderOp data → we are now at offset 40 */

    int pos = 40;

    /* Scan opcodes to find the pixel data block.
     *
     * Key PICT v2 opcode facts:
     *  0x0000 = NOP (0 bytes)
     *  0x0001 = ClipRgn (variable: first 2 bytes = total region size incl. those 2 bytes)
     *  0x001E = DefHilite (0 bytes — NOT ClipRgn!)
     *  0x00A0 = ShortComment (2 bytes)
     *  0x00A1 = LongComment  (kind(2) + size(2) + data(size))
     *  0x00FF = EndPicture
     *  Opcodes 0x0100-0x7FFF: next 2 bytes = data length
     *  Opcodes >= 0x8000:     next 4 bytes = data length
     *  0x0C00 (HeaderOp) is in the 0x0100-0x7FFF range but has a FIXED 24-byte payload;
     *    however we already skipped it above, so it won't appear again here.
     */
    while (pos + 2 <= picSize) {
        uint16_t op = (uint16_t)((pict[pos] << 8) | pict[pos+1]);
        pos += 2;  /* skip opcode */
        switch (op) {
            /* --- Zero-byte opcodes ---------------------------------------- */
            case 0x0000:    /* NOP */
            case 0x001D:    /* HiliteMode */
            case 0x001E:    /* DefHilite (0 bytes — not ClipRgn!) */
                break;

            /* --- ClipRgn (variable size region) --------------------------- */
            case 0x0001: {
                if (pos + 2 > picSize) return -1;
                int rsize = (int)((pict[pos] << 8) | pict[pos+1]);
                if (rsize < 2) rsize = 2;
                pos += rsize;
                break;
            }

            /* --- Fixed small opcodes --------------------------------------- */
            case 0x0003: case 0x0004: case 0x0005: case 0x0008:
            case 0x000D: case 0x0015: case 0x0016: case 0x00A0:
                pos += 2; break;
            case 0x0006: case 0x0007: case 0x000B: case 0x000C:
            case 0x000E: case 0x000F: case 0x0026: case 0x0027:
                pos += 4; break;
            case 0x001A: case 0x001B: case 0x001F: /* RGBFgColor, RGBBkColor, HiliteColor */
            case 0x0022: case 0x0023:
                pos += 6; break;
            case 0x0009: case 0x000A: case 0x0010:
            case 0x0020: case 0x0021:
            case 0x0028: case 0x0029: case 0x002A: case 0x002B: case 0x002C:
            case 0x0030: case 0x0031: case 0x0032: case 0x0033: case 0x0034:
            case 0x0038: case 0x0039: case 0x003A: case 0x003B: case 0x003C:
                pos += 8; break;
            case 0x0040: case 0x0041: case 0x0042: case 0x0043: case 0x0044:
                pos += 12; break;

            /* --- Variable-size drawing opcodes (poly/region) -------------- */
            case 0x0050: case 0x0051: case 0x0052: case 0x0053: case 0x0054:
            case 0x0060: case 0x0061: case 0x0062: case 0x0063: case 0x0064:
            case 0x0070: case 0x0071: case 0x0072: case 0x0073: case 0x0074: {
                if (pos + 2 > picSize) return -1;
                int vsz = (int)((pict[pos] << 8) | pict[pos+1]);
                pos += vsz;
                break;
            }

            /* --- Text drawing opcodes ------------------------------------- */
            case 0x00B0: {  /* LongText: point(4) + count(1) + text */
                if (pos + 5 > picSize) return -1;
                int cnt = (int)pict[pos+4];
                pos += 5 + cnt;
                if (pos & 1) pos++;  /* word-align */
                break;
            }
            case 0x00B1: case 0x00B2: {  /* DhText / DvText: dh/dv(1) + count(1) + text */
                if (pos + 2 > picSize) return -1;
                int cnt = (int)pict[pos+1];
                pos += 2 + cnt;
                if (pos & 1) pos++;
                break;
            }
            case 0x00B3: {  /* DhDvText: dh(1) + dv(1) + count(1) + text */
                if (pos + 3 > picSize) return -1;
                int cnt = (int)pict[pos+2];
                pos += 3 + cnt;
                if (pos & 1) pos++;
                break;
            }

            /* --- LongComment ---------------------------------------------- */
            case 0x00A1: {
                if (pos + 4 > picSize) return -1;
                int lsize = (int)((pict[pos+2] << 8) | pict[pos+3]);
                pos += 4 + lsize;
                break;
            }

            /* --- Pixel data opcodes --------------------------------------- */
            /*
             * PackBitsRect (0x0098) / PackBitsRgn (0x0099):
             *   PixMap WITHOUT baseAddr (46 bytes): rowBytes(2)+bounds(8)+...
             *   pixelSize is at offset 28 within this record.
             *   ColorTable follows the PixMap: ctSeed(4)+ctFlags(2)+ctSize(2)
             *     + (ctSize+1) entries × 8 bytes each.
             *   srcRect(8)+dstRect(8)+mode(2) follow ColorTable.
             *   PackBitsRgn (0x0099) has a RgnData clip after the rects.
             */
            case 0x0098:    /* PackBitsRect */
            case 0x0099: {  /* PackBitsRgn  */
                if (pos + 46 > picSize) return -1;
                int pixelSize = (int)((pict[pos+28] << 8) | pict[pos+29]);
                int bpp = (pixelSize == 16) ? 2 : 1;
                int rowbytes = picW * bpp;
                pos += 46;  /* skip 46-byte PixMap (no baseAddr) */
                /* ColorTable: ctSeed(4) + ctFlags(2) + ctSize(2) + entries */
                if (pos + 8 > picSize) return -1;
                {
                    int ctSize = (int)((pict[pos+6] << 8) | pict[pos+7]);
                    int ctBytes = 8 + (ctSize + 1) * 8;
                    if (pos + ctBytes > picSize) return -1;
                    pos += ctBytes;
                }
                if (pos + 18 > picSize) return -1;
                pos += 18;  /* srcRect(8) + dstRect(8) + mode(2) */
                if (op == 0x0099) {
                    if (pos + 2 > picSize) return -1;
                    int rsz = (int)((pict[pos] << 8) | pict[pos+1]);
                    pos += rsz;
                }
                *out_bpp      = bpp;
                *out_rowbytes = rowbytes;
                return pos;
            }

            case 0x009A:    /* DirectBitsRect */
            case 0x009B: {  /* DirectBitsRgn  */
                /*
                 * Mac PixMap record layout (50 bytes total):
                 *   baseAddr(4) + rowBytes(2) + bounds(8) + pmVersion(2) +
                 *   packType(2) + packSize(4) + hRes(4) + vRes(4) +
                 *   pixelType(2) + pixelSize(2) + cmpCount(2) + cmpSize(2) +
                 *   planeBytes(4) + pmTable(4) + pmReserved(4) = 50 bytes
                 * pixelSize is at offset 32 within the PixMap record.
                 */
                if (pos + 50 > picSize) return -1;
                int pixelSize = (int)((pict[pos+32] << 8) | pict[pos+33]);
                int bpp = (pixelSize == 16) ? 2 : 1;
                int rowbytes = picW * bpp;
                pos += 50;  /* skip PixMap record */
                if (pos + 18 > picSize) return -1;
                pos += 18;  /* srcRect(8) + dstRect(8) + mode(2) */
                if (op == 0x009B) {
                    if (pos + 2 > picSize) return -1;
                    int rsz = (int)((pict[pos] << 8) | pict[pos+1]);
                    pos += rsz;
                }
                *out_bpp      = bpp;
                *out_rowbytes = rowbytes;
                return pos;
            }

            case 0x00FF:    /* EndPicture */
                return -1;

            default:
                /* Opcodes 0x0100-0x7FFF: 2-byte data length follows */
                if (op >= 0x0100 && op <= 0x7FFF) {
                    if (pos + 2 > picSize) return -1;
                    int dsz = (int)((pict[pos] << 8) | pict[pos+1]);
                    pos += 2 + dsz;
                    break;
                }
                /* Opcodes >= 0x8000: 4-byte data length follows */
                if (op >= 0x8000) {
                    if (pos + 4 > picSize) return -1;
                    int dsz = (int)((pict[pos] << 8) | pict[pos+1]) << 16 |
                              (int)((pict[pos+2] << 8) | pict[pos+3]);
                    pos += 4 + dsz;
                    break;
                }
                return -1;
        }
    }
    return -1;
}

/*
 * DrawPicture - decode a Mac PICT v2 (PPic resource) into the current GWorld.
 *
 * All PPic resources in resources.dat use PICT v2 format with 16-bit pixels
 * (15-bit packed x5R5G5B) stored using PackBits compression, one row at a time
 * with a 2-byte byteCount prefix per row (rowBytes > 250 → 2-byte count).
 *
 * The game uses images of various sizes:
 *   - 640×480: main screens (PPic 1000-1008)
 *   - 456×2767: credits scroll (PPic 1009)
 *
 * We use the PICT v2 opcode scanner above to locate the pixel data reliably,
 * with a fallback to the original brute-force search for edge cases.
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
    int picSize = (int)GetHandleSize((Handle)myPicture);

    /* Parse PICT bounds rect (big-endian SInt16: top, left, bottom, right) */
    picTop    = (int16_t)(((uint16_t)pict[2] << 8) | pict[3]);
    picLeft   = (int16_t)(((uint16_t)pict[4] << 8) | pict[5]);
    picBottom = (int16_t)(((uint16_t)pict[6] << 8) | pict[7]);
    picRight  = (int16_t)(((uint16_t)pict[8] << 8) | pict[9]);
    picW = picRight  - picLeft;
    picH = picBottom - picTop;

    if (picW <= 0 || picH <= 0 || picW > 8192 || picH > 8192) {
        fprintf(stderr, "DrawPicture: bad picture size %dx%d\n", picW, picH);
        return;
    }

    /* Try opcode-based pixel data finder first */
    {
        int bpp = 2, rowbytes = picW * 2;
        pixDataOff = pict_find_pixdata(pict, picSize, picW, picH, &bpp, &rowbytes);
        picBpp = bpp;
    }

    if (pixDataOff < 0) {
        /*
         * Opcode scan failed — fall back to brute-force search.
         * Try each candidate offset and depth, accepting the first one where
         * all picH rows have a valid byteCount.
         */
        static const int OFFSETS[] = {
            122, 124, 126, 128, 130, 132, 134, 136, 138, 140,
            142, 144, 146, 148, 150, 152, 154, 156, 106, 108,
            110, 112, 114, 116, 118, 120, 80, 82, 84, 86, 88,
            90, 92, 94, 96, 98, 100, 102, 104, 158, 160, -1 };
        int depths[] = { 2, 1 };
        int di, ci, found = 0;
        for (di = 0; di < 2 && !found; di++) {
            int bpp = depths[di];
            int rowBytes = picW * bpp;
            int bcBytes  = (rowBytes > 250) ? 2 : 1;
            for (ci = 0; OFFSETS[ci] >= 0 && !found; ci++) {
                int off = OFFSETS[ci];
                int ok = 1, consumed = 0;
                for (int r = 0; r < picH && ok; r++) {
                    if (off + bcBytes > picSize) { ok = 0; break; }
                    int bc = (bcBytes == 2) ?
                        (int)(((uint16_t)pict[off]<<8)|pict[off+1]) : (int)pict[off];
                    if (bc <= 0 || bc > rowBytes * 3 / 2 + 128) { ok = 0; break; }
                    consumed += bcBytes + bc;
                    off      += bcBytes + bc;
                }
                if (ok && consumed > rowBytes * picH / 8) {
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

            /* Read byteCount (2 bytes if rowBytes > 250, else 1 byte) */
            if (src + bcBytes > pict + picSize) break;
            bc = (bcBytes == 2) ?
                 (int)(((uint16_t)src[0] << 8) | src[1]) :
                 (int)src[0];
            src += bcBytes;

            if (bc < 0 || src + bc > pict + picSize) break;

            /* Decode PackBits row into rowBuf (rowBytes of output) */
            memset(rowBuf, 0, (size_t)rowBytes);
            if (bc > 0) {
                if (picBpp == 2)
                    unpack_bits16(src, bc, rowBuf, rowBytes);
                else
                    unpack_bits(src, bc, rowBuf, rowBytes);
            }
            src += bc;

            /* Skip rows that fall outside the destination port */
            if (dstY < 0 || dstY >= gYSize) continue;

            if (picBpp == 1) {
                /* 8-bit indexed: copy palette indices directly */
                UInt8 *dst = portPix + dstY * portRb + dstLeft;
                int w = picW;
                if (dstLeft + w > gXSize) w = gXSize - dstLeft;
                if (w > 0 && dstLeft < gXSize) memcpy(dst, rowBuf, (size_t)w);
            } else {
                /* 16-bit x5R5G5B → 8-bit palette index via lookup table */
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
    if (!r || gQDOpenRgn) return;
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
    UInt8 *pix;
    int rb;
    if (!r || gQDOpenRgn) return;
    pix = current_port_pixels();
    rb = current_port_rowbytes();
    if (!pix || !rb) return;
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
void DrawString(const char *s)                      { (void)s; /* text rendering not implemented */ }
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

void InitCursor(void)  { }   /* no-op: SDL2 cursor managed via SDL_ShowCursor */
void HideCursor(void)  { }
void ShowCursor(void)  { }


void DragWindow(WindowPtr w, Point startPt, const Rect *boundsRect) {
    (void)w; (void)startPt; (void)boundsRect;
}

short FindWindow(Point pt, WindowPtr *which) {
    if (which) *which = NULL;
    return 0;
}

void HideWindow(WindowPtr w)   { (void)w; }
void ShowWindow(WindowPtr w)   { (void)w; }
void SelectWindow(WindowPtr w) { (void)w; }

/*---------------------------------------------------------------------------*/
/* Dialog Manager                                                            */
/*---------------------------------------------------------------------------*/

DialogPtr GetNewDialog(short id, void *wStorage, WindowPtr behind) {
    (void)id; (void)wStorage; (void)behind;
    return (DialogPtr)calloc(1, sizeof(OpaqueDialogPtr));
}

void DisposeDialog(DialogPtr dialog) {
    if (dialog) free(dialog);
}

void ModalDialog(void *filterProc, short *itemHit) {
    (void)filterProc;
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
    LOG_DEBUG("[%s] %s\n       %s\n", typeStr,
           error ? error : "", explanation ? explanation : "");
    if (itemHit) *itemHit = 1;
    return 0;
}

short StopAlert(short alertID, void *filterProc) {
    LOG_DEBUG("[StopAlert %d]\n", alertID);
    return 1;
}

/*---------------------------------------------------------------------------*/
/* Appearance Manager                                                        */
/*---------------------------------------------------------------------------*/

OSErr RegisterAppearanceClient(void) {
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
    LOG_DEBUG("[ExitToShell]\n");
    exit(0);
}
#endif

void DebugStr(const char *debuggerMsg) {
    LOG_DEBUG("[DebugStr] %s\n", debuggerMsg ? debuggerMsg : "");
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

#ifndef PORT_SDL2
/* SDL2 port provides its own sound manager in sdl_platform.c */

OSErr SndNewChannel(SndChannelPtr *chan, short synth, long init,
                     SndCallBackProcPtr userRoutine) {
    (void)synth; (void)init;
    if (!chan) return -50;
    *chan = (SndChannelPtr)calloc(1, sizeof(SndChannel));
    if (!*chan) return -108;
    (*chan)->callBack = userRoutine;
    return 0;
}

OSErr SndDisposeChannel(SndChannelPtr chan, Boolean quietNow) {
    (void)quietNow;
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
    /* Return version 3.6 - > 0x03600000 enables HQ mode */
    NumVersion v;
    v.majorRev    = 3;
    v.minorAndBugRev = 0x60;
    v.stage       = 0x80;   /* final release */
    v.nonRelRev   = 0;
    return v;
}

OSErr GetSoundOutputInfo(ComponentInstance ci, OSType selector, void *infoPtr) {
    if (selector == 'srat' && infoPtr) *(long*)infoPtr = 0x56220000; /* rate22050hz */
    return 0;
}

OSErr SetSoundOutputInfo(ComponentInstance ci, OSType selector, void *infoPtr) {
    return 0;
}

Component FindNextComponent(Component aComponent, ComponentDescription *looking) {
    return (Component)(intptr_t)1;
}

#endif /* !PORT_SDL2 */


/* AppleEvents stubs - not needed outside Mac */
void InitAE(void) { /* no-op: Apple Events not available on SDL2/WASM */ }

/* Input stubs - Mac ISP not available on SDL2/WASM */
void InitInput(void)     { /* SDL2 keyboard via GetKeys()/IsPressed() */ }
void ConfigureInput(void){ }
void ConfigureHID(void)  { }
