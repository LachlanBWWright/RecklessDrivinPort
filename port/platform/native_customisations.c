/* Shared persistence and launch integration for the native customisation dialogs. */
#include "native_customisations.h"
#include "gameinitexit.h"
#include "preferences.h"
#include <SDL.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#if defined(_WIN32)
/* Keep Win32 headers out of the classic Mac compatibility translation units. */
FILE *RDWindowsOpenFile(const char *path, const char *mode);
int RDWindowsRemoveFile(const char *path);
int RDWindowsRenameFile(const char *source, const char *destination);
int RDWindowsRestart(void);
#define fopen RDWindowsOpenFile
#define remove RDWindowsRemoveFile
#define rename RDWindowsRenameFile
#elif !defined(__ANDROID__)
#include <unistd.h>
#include <sys/types.h>
#include <sys/wait.h>
#ifdef __APPLE__
#include <mach-o/dyld.h>
#endif
#endif

#define MAX_PACKS 128
static RDCustomisations current;
static char *directory;
static char paths[MAX_PACKS][4096];
static char names[MAX_PACKS][256];
static int count;

static int storage_path(char *out, size_t capacity, const char *name)
{
    if (!directory) directory = SDL_GetPrefPath("RecklessDrivin", "Customisations");
    return directory && SDL_snprintf(out, capacity, "%s%s", directory, name) < (int)capacity;
}

static void load_library(void)
{
    char path[4096], line[4608];
    FILE *file;
    count = 0;
    if (!storage_path(path, sizeof(path), "library.tsv")) return;
    file = fopen(path, "rb");
    if (!file) return;
    while (count < MAX_PACKS && fgets(line, sizeof(line), file)) {
        char *tab = strchr(line, '\t');
        if (!tab) continue;
        *tab++ = 0;
        tab[strcspn(tab, "\r\n")] = 0;
        /* Index entries contain managed filenames only. */
        if (strchr(line, '/') || strchr(line, '\\') || strstr(line, "..")) continue;
        if (!storage_path(paths[count], sizeof(paths[count]), line)) continue;
        FILE *pack = fopen(paths[count], "rb");
        if (!pack) continue;
        fclose(pack);
        SDL_strlcpy(names[count], tab, sizeof(names[count]));
        count++;
    }
    fclose(file);
}

int RDNativeResourceCount(void) { load_library(); return count; }
const char *RDNativeResourceName(int i) { return i >= 0 && i < count ? names[i] : ""; }
const char *RDNativeResourcePath(int i) { return i >= 0 && i < count ? paths[i] : ""; }

static uint32_t little32(const unsigned char *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

int RDNativeImportResource(const char *source, char *out, size_t capacity)
{
    FILE *in = fopen(source, "rb"), *dest;
    unsigned char header[16], buffer[65536];
    uint64_t hash = UINT64_C(14695981039346656037);
    char filename[64], path[4096], temp[4096], index[4096];
    size_t n;
    int entries = 0, hasMenu = 0;
    long size;
    if (!in) return 0;
    if (fseek(in, 0, SEEK_END) || (size = ftell(in)) <= 0 || size > 256L * 1024 * 1024) { fclose(in); return 0; }
    rewind(in);
    /* Validate the complete resource envelope before copying into the library. */
    while (ftell(in) < size) {
        if (fread(header, 1, 16, in) != 16) { fclose(in); return 0; }
        uint32_t length = little32(header + 12);
        if (length > (uint32_t)(size - ftell(in))) { fclose(in); return 0; }
        if (!memcmp(header, "PPic", 4) && little32(header + 8) == 1000) hasMenu = 1;
        if (fseek(in, (long)length, SEEK_CUR)) { fclose(in); return 0; }
        entries++;
    }
    if (!entries || !hasMenu) { fclose(in); return 0; }
    rewind(in);
    while ((n = fread(buffer, 1, sizeof(buffer), in)))
        for (size_t i = 0; i < n; i++) { hash ^= buffer[i]; hash *= UINT64_C(1099511628211); }
    if (ferror(in)) { fclose(in); return 0; }
    SDL_snprintf(filename, sizeof(filename), "pack-%016llx.dat", (unsigned long long)hash);
    if (!storage_path(path, sizeof(path), filename) || strlen(path) >= capacity) { fclose(in); return 0; }
    load_library();
    for (int i = 0; i < count; i++) if (!strcmp(paths[i], path)) {
        SDL_strlcpy(out, path, capacity); fclose(in); return 1;
    }
    if (count == MAX_PACKS || !storage_path(temp, sizeof(temp), "import.tmp") || !storage_path(index, sizeof(index), "library.tsv")) { fclose(in); return 0; }
    dest = fopen(temp, "wb");
    if (!dest) { fclose(in); return 0; }
    rewind(in);
    int success = 1;
    while ((n = fread(buffer, 1, sizeof(buffer), in))) if (fwrite(buffer, 1, n, dest) != n) { success = 0; break; }
    if (ferror(in)) success = 0;
    fclose(in);
    if (fclose(dest)) success = 0;
    if (!success || rename(temp, path)) { remove(temp); return 0; }
    const char *base = source;
    for (const char *p = source; *p; p++) if (*p == '/' || *p == '\\') base = p + 1;
    char label[256];
    SDL_strlcpy(label, base, sizeof(label));
    for (char *p = label; *p; p++) if (*p == '\t' || *p == '\n' || *p == '\r') *p = ' ';
    dest = fopen(index, "ab");
    if (!dest) { remove(path); return 0; }
    success = fprintf(dest, "%s\t%s\n", filename, label) > 0;
    if (fclose(dest)) success = 0;
    if (!success) return 0;
    SDL_strlcpy(out, path, capacity);
    load_library();
    return 1;
}

void RDNativeLoadCustomisations(void)
{
    char path[4096];
    memset(&current, 0, sizeof(current));
    current.level = 1;
    if (!storage_path(path, sizeof(path), "settings.txt")) return;
    FILE *file = fopen(path, "rb");
    if (file) {
        RDCustomisations loaded = current;
        if (fscanf(file, "RD1 %d %d %d %d %d %d %u %u\n", &loaded.levelEnabled, &loaded.level,
            &loaded.hasStartY, &loaded.startY, &loaded.hasObjectGroupStartY, &loaded.objectGroupStartY,
            &loaded.forcedAddOns, &loaded.disabledBonusRollMask) == 8) {
            if (fgets(loaded.resourcePath, sizeof(loaded.resourcePath), file))
                loaded.resourcePath[strcspn(loaded.resourcePath, "\r\n")] = 0;
            if (loaded.level >= 1 && loaded.startY >= 0 && loaded.objectGroupStartY >= 0) current = loaded;
        }
        fclose(file);
    }
    if (current.resourcePath[0]) {
        FILE *resource = fopen(current.resourcePath, "rb");
        if (resource) { fclose(resource); Pomme_LoadResourceFile(current.resourcePath); }
        else current.resourcePath[0] = 0;
    }
}

void RDNativePrepareNewGame(void)
{
    int enabled = current.levelEnabled || current.hasStartY || current.hasObjectGroupStartY ||
        current.forcedAddOns || current.disabledBonusRollMask;
    tEditorLaunchOptions options = {enabled, current.levelEnabled, current.levelEnabled ? current.level - 1 : 0,
        current.hasStartY, current.startY, current.hasObjectGroupStartY, current.objectGroupStartY,
        current.forcedAddOns, current.disabledBonusRollMask};
    SetEditorLaunchOptions(&options);
}

void RDNativeApplyLaunchOptions(void)
{
    RDNativePrepareNewGame();
    if (current.levelEnabled) rd_start_editor_test_drive();
}

static int save_settings(const RDCustomisations *value)
{
    char path[4096], temp[4096];
    if (!storage_path(path, sizeof(path), "settings.txt") || !storage_path(temp, sizeof(temp), "settings.tmp")) return 0;
    FILE *file = fopen(temp, "wb");
    if (!file) return 0;
    int success = fprintf(file, "RD1 %d %d %d %d %d %d %u %u\n%s\n", value->levelEnabled, value->level,
        value->hasStartY, value->startY, value->hasObjectGroupStartY, value->objectGroupStartY,
        value->forcedAddOns, value->disabledBonusRollMask, value->resourcePath) > 0;
    if (fclose(file)) success = 0;
    if (!success) { remove(temp); return 0; }
    return rename(temp, path) == 0;
}

static int restart_game(void)
{
#ifdef __ANDROID__
    extern void RDPlatformRestart(void);
    RDPlatformRestart();
    return 1;
#elif defined(_WIN32)
    if (!RDWindowsRestart()) return 0;
    extern int gExit;
    gExit = 1;
    return 1;
#else
    char executable[4096];
#ifdef __APPLE__
    uint32_t size = sizeof(executable);
    if (_NSGetExecutablePath(executable, &size)) return 0;
#else
    ssize_t length = readlink("/proc/self/exe", executable, sizeof(executable) - 1);
    if (length < 0) return 0;
    executable[length] = 0;
#endif
    /* Replace this process; all resources are reconstructed from the saved settings. */
    execl(executable, executable, (char *)NULL);
    return 0;
#endif
}

void RDNativeShowCustomisations(void)
{
    RDCustomisations draft = current;
    if (!RDPlatformShowCustomisations(&draft)) return;
    if (!save_settings(&draft)) {
        SDL_ShowSimpleMessageBox(SDL_MESSAGEBOX_ERROR, "Customisations", "Could not save customisations. Your current game has been kept.", NULL);
        return;
    }
    WritePrefs(false);
    if (!restart_game()) SDL_ShowSimpleMessageBox(SDL_MESSAGEBOX_ERROR, "Customisations", "Settings saved. Please close and reopen the game to apply them.", NULL);
}
