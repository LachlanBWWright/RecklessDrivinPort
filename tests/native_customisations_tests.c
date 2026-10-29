/* Exercise the resource library against isolated, real filesystem storage. */
#include "platform/native_customisations.h"
#include "gameinitexit.h"
#include <SDL.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/wait.h>
#include <dirent.h>
#include <sys/stat.h>

#define CHECK(condition) do { if (!(condition)) { \
    fprintf(stderr, "line %d: %s\n", __LINE__, #condition); exit(1); \
} } while (0)

static tEditorLaunchOptions captured;
static int starts;
static int loaded;
static char loadedPath[4096];
static int prefsWritten;

int RDPlatformShowCustomisations(RDCustomisations *settings)
{
    settings->level = 999;
    settings->forcedAddOns = 0;
    settings->resourcePath[0] = 0;
    return 0;
}
void SetEditorLaunchOptions(const tEditorLaunchOptions *options) { captured = *options; }
void rd_start_editor_test_drive(void) { starts++; }
void Pomme_LoadResourceFile(const char *path)
{
    loaded++;
    SDL_strlcpy(loadedPath, path, sizeof(loadedPath));
}
void WritePrefs(int reset) { (void)reset; prefsWritten++; }

static void write_bytes(const char *path, const void *bytes, size_t length)
{
    FILE *file = fopen(path, "wb");
    CHECK(file);
    CHECK(fwrite(bytes, 1, length, file) == length);
    CHECK(fclose(file) == 0);
}

static void equal_contents(const char *path, const void *expected, size_t length)
{
    unsigned char bytes[512];
    CHECK(length <= sizeof(bytes));
    FILE *file = fopen(path, "rb");
    CHECK(file);
    CHECK(fread(bytes, 1, sizeof(bytes), file) == length);
    CHECK(memcmp(bytes, expected, length) == 0);
    CHECK(fclose(file) == 0);
}

static void remove_tree(const char *path)
{
    DIR *dir = opendir(path);
    CHECK(dir);
    struct dirent *entry;
    while ((entry = readdir(dir))) {
        if (!strcmp(entry->d_name, ".") || !strcmp(entry->d_name, "..")) continue;
        char child[4096];
        CHECK(snprintf(child, sizeof(child), "%s/%s", path, entry->d_name) < (int)sizeof(child));
        struct stat info;
        CHECK(lstat(child, &info) == 0);
        if (S_ISDIR(info.st_mode)) remove_tree(child);
        else CHECK(unlink(child) == 0);
    }
    CHECK(closedir(dir) == 0);
    CHECK(rmdir(path) == 0);
}

int main(int argc, char **argv)
{
    if (argc == 3 && !strcmp(argv[1], "--rediscover")) {
        CHECK(RDNativeResourceCount() == 1);
        CHECK(!strcmp(RDNativeResourceName(0), "custom.dat"));
        CHECK(!strcmp(RDNativeResourcePath(0), argv[2]));
        return 0;
    }
    char storage[] = "/tmp/rd-native-customisations-XXXXXX";
    CHECK(mkdtemp(storage));
    CHECK(setenv("XDG_DATA_HOME", storage, 1) == 0);
    char source[4096], duplicate[4096], imported[4096], second[4096];
    snprintf(source, sizeof(source), "%s/custom.dat", storage);
    snprintf(duplicate, sizeof(duplicate), "%s/same-data.dat", storage);
    /* Actual envelope shape: four-byte type, reserved word, LE ID and size. */
    const unsigned char pack[] = {
        'P','P','i','c', 0,0,0,0, 0xe8,3,0,0, 4,0,0,0, 1,2,3,4,
        'P','a','c','k', 0,0,0,0, 0x80,0,0,0, 3,0,0,0, 5,6,7
    };
    CHECK(RDNativeResourceCount() == 0);
    CHECK(!strcmp(RDNativeResourceName(-1), ""));
    CHECK(!strcmp(RDNativeResourcePath(1000), ""));
    write_bytes(source, pack, sizeof(pack));
    CHECK(RDNativeImportResource(source, imported, sizeof(imported)));
    CHECK(strcmp(source, imported) != 0);
    CHECK(RDNativeResourceCount() == 1);
    CHECK(!strcmp(RDNativeResourceName(0), "custom.dat"));
    equal_contents(imported, pack, sizeof(pack));
    write_bytes(duplicate, pack, sizeof(pack));
    CHECK(RDNativeImportResource(duplicate, second, sizeof(second)));
    CHECK(!strcmp(imported, second));
    CHECK(RDNativeResourceCount() == 1);
    CHECK(unlink(source) == 0);
    CHECK(unlink(duplicate) == 0);
    equal_contents(imported, pack, sizeof(pack));
    /* A fresh process must rediscover the copied library without the source. */
    pid_t child = fork();
    CHECK(child >= 0);
    if (!child) { execl(argv[0], argv[0], "--rediscover", imported, (char *)NULL); _exit(127); }
    int status;
    CHECK(waitpid(child, &status, 0) == child);
    CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 0);
    /* Reject short headers, oversized entry payloads and missing required menu. */
    write_bytes(source, pack, 15);
    CHECK(!RDNativeImportResource(source, second, sizeof(second)));
    write_bytes(source, pack, sizeof(pack) - 1);
    CHECK(!RDNativeImportResource(source, second, sizeof(second)));
    write_bytes(source, pack + 20, sizeof(pack) - 20);
    CHECK(!RDNativeImportResource(source, second, sizeof(second)));
    write_bytes(source, "", 0);
    CHECK(!RDNativeImportResource(source, second, sizeof(second)));
    write_bytes(source, pack, sizeof(pack));
    CHECK(!RDNativeImportResource(source, second, 1));
    CHECK(RDNativeResourceCount() == 1);
    /* Cancellation must not write settings or preferences, even if UI mutated its draft. */
    char *prefDirectory = SDL_GetPrefPath("RecklessDrivin", "Customisations");
    CHECK(prefDirectory);
    char settingsPath[4096], settings[4608];
    snprintf(settingsPath, sizeof(settingsPath), "%ssettings.txt", prefDirectory);
    RDNativeLoadCustomisations();
    RDNativeShowCustomisations();
    CHECK(access(settingsPath, F_OK) != 0 && prefsWritten == 0);
    int length = snprintf(settings, sizeof(settings), "RD1 1 3 1 1200 1 700 120 255\n%s\n", imported);
    CHECK(length > 0 && length < (int)sizeof(settings));
    write_bytes(settingsPath, settings, (size_t)length);
    RDNativeLoadCustomisations();
    CHECK(loaded == 1 && !strcmp(loadedPath, imported));
    RDNativeShowCustomisations();
    equal_contents(settingsPath, settings, (size_t)length);
    CHECK(prefsWritten == 0);
    RDNativeApplyLaunchOptions();
    CHECK(captured.enabled && captured.autoStart && captured.levelID == 2 && starts == 1);
    CHECK(captured.hasStartY && captured.startY == 1200);
    CHECK(captured.hasObjectGroupStartY && captured.objectGroupStartY == 700);
    CHECK(captured.forcedAddOns == 120 && captured.disabledBonusRollMask == 255);
    SDL_free(prefDirectory);
    remove_tree(storage);
    puts("Native customisations resource library and cancellation tests passed.");
    return 0;
}
