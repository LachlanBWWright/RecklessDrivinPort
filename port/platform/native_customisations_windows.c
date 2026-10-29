#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <commdlg.h>
#include <limits.h>
#include <errno.h>
#include <wchar.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "native_customisations.h"

#define RD_DIALOG_CLASS L"RecklessDrivinCustomisations"
static const wchar_t *addonNames[] = {L"Lock", L"Police jammer", L"Turbo engine", L"Spikes"};
static const wchar_t *bonusNames[] = {L"Lock", L"Mines", L"Missiles", L"Spikes", L"Police jammer", L"Turbo", L"Score award", L"Extra life"};
static const unsigned addonMasks[] = {8, 16, 32, 64};
typedef struct {
    RDCustomisations draft;
    HWND window, resources, levels, level, start, startValue, group, groupValue;
    HWND addons[4], bonuses[8];
    int applied;
} Dialog;

static HWND control(HWND parent, const wchar_t *type, const wchar_t *text, DWORD style,
                    int x, int y, int width, int height, int id)
{
    HWND child = CreateWindowExW(wcscmp(type, L"EDIT") == 0 ? WS_EX_CLIENTEDGE : 0,
        type, text, WS_CHILD | WS_VISIBLE | style, x, y, width, height,
        parent, (HMENU)(INT_PTR)id, GetModuleHandleW(NULL), NULL);
    SendMessageW(child, WM_SETFONT, (WPARAM)GetStockObject(DEFAULT_GUI_FONT), TRUE);
    return child;
}
static void setChecked(HWND button, int checked) { SendMessageW(button, BM_SETCHECK, checked ? BST_CHECKED : BST_UNCHECKED, 0); }
static int checked(HWND button) { return SendMessageW(button, BM_GETCHECK, 0, 0) == BST_CHECKED; }
static HWND number(HWND parent, int value, int x, int y)
{
    wchar_t text[32];
    swprintf(text, 32, L"%d", value);
    return control(parent, L"EDIT", text, WS_TABSTOP | ES_AUTOHSCROLL, x, y, 100, 25, 0);
}
static int readNumber(HWND edit, int *value)
{
    wchar_t text[64], *end;
    long parsed;
    GetWindowTextW(edit, text, 64);
    errno = 0;
    parsed = wcstol(text, &end, 10);
    if (!text[0] || *end || errno == ERANGE || parsed < INT_MIN || parsed > INT_MAX) return 0;
    *value = (int)parsed;
    return 1;
}
static void fillResources(Dialog *dialog)
{
    int count = RDNativeResourceCount(), selected = 0;
    SendMessageW(dialog->resources, CB_RESETCONTENT, 0, 0);
    SendMessageW(dialog->resources, CB_ADDSTRING, 0, (LPARAM)L"Original game");
    for (int i = 0; i < count; i++) {
        wchar_t name[1024];
        if (!MultiByteToWideChar(CP_UTF8, 0, RDNativeResourceName(i), -1, name, 1024))
            wcscpy(name, L"Resource pack");
        SendMessageW(dialog->resources, CB_ADDSTRING, 0, (LPARAM)name);
        if (strcmp(dialog->draft.resourcePath, RDNativeResourcePath(i)) == 0) selected = i + 1;
    }
    SendMessageW(dialog->resources, CB_SETCURSEL, selected, 0);
}
static void importResource(Dialog *dialog)
{
    wchar_t path[4096] = L"";
    char utf8[16384];
    OPENFILENAMEW picker = {0};
    picker.lStructSize = sizeof(picker);
    picker.hwndOwner = dialog->window;
    picker.lpstrFilter = L"Resource packs (*.dat)\0*.dat\0All files\0*.*\0";
    picker.lpstrFile = path;
    picker.nMaxFile = 4096;
    picker.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
    if (!GetOpenFileNameW(&picker)) return;
    if (!WideCharToMultiByte(CP_UTF8, 0, path, -1, utf8, sizeof(utf8), NULL, NULL) ||
        !RDNativeImportResource(utf8, dialog->draft.resourcePath, sizeof(dialog->draft.resourcePath))) {
        MessageBoxW(dialog->window, L"The resource pack could not be imported. Check that it is a valid resources.dat file.", L"Import failed", MB_OK | MB_ICONERROR);
        return;
    }
    fillResources(dialog);
}
static void apply(Dialog *dialog)
{
    RDCustomisations draft = dialog->draft;
    draft.levelEnabled = checked(dialog->levels);
    draft.hasStartY = checked(dialog->start);
    draft.hasObjectGroupStartY = checked(dialog->group);
    if ((draft.levelEnabled && (!readNumber(dialog->level, &draft.level) || draft.level < 1)) ||
        (draft.hasStartY && (!readNumber(dialog->startValue, &draft.startY) || draft.startY < 0)) ||
        (draft.hasObjectGroupStartY && (!readNumber(dialog->groupValue, &draft.objectGroupStartY) || draft.objectGroupStartY < 0))) {
        MessageBoxW(dialog->window, L"Enter a positive level number and whole-number start positions.", L"Check settings", MB_OK | MB_ICONWARNING);
        return;
    }
    draft.forcedAddOns = 0;
    draft.disabledBonusRollMask = 0;
    for (int i = 0; i < 4; i++) if (checked(dialog->addons[i])) draft.forcedAddOns |= addonMasks[i];
    for (int i = 0; i < 8; i++) if (checked(dialog->bonuses[i])) draft.disabledBonusRollMask |= 1u << i;
    LRESULT selected = SendMessageW(dialog->resources, CB_GETCURSEL, 0, 0);
    snprintf(draft.resourcePath, sizeof(draft.resourcePath), "%s", selected > 0 ? RDNativeResourcePath((int)selected - 1) : "");
    dialog->draft = draft;
    dialog->applied = 1;
    DestroyWindow(dialog->window);
}
static LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam)
{
    Dialog *dialog = (Dialog *)GetWindowLongPtrW(window, GWLP_USERDATA);
    if (message == WM_NCCREATE) {
        dialog = ((CREATESTRUCTW *)lParam)->lpCreateParams;
        SetWindowLongPtrW(window, GWLP_USERDATA, (LONG_PTR)dialog);
    }
    if (message == WM_COMMAND && dialog) {
        switch (LOWORD(wParam)) {
            case IDOK: apply(dialog); return 0;
            case IDCANCEL: DestroyWindow(window); return 0;
            case 100: importResource(dialog); return 0;
        }
    }
    if (message == WM_CLOSE) { DestroyWindow(window); return 0; }
    return DefWindowProcW(window, message, wParam, lParam);
}
int RDPlatformShowCustomisations(RDCustomisations *settings)
{
    Dialog dialog = {0};
    WNDCLASSW windowClass = {0};
    MSG message;
    HWND owner = GetActiveWindow();
    dialog.draft = *settings;
    windowClass.lpfnWndProc = windowProc;
    windowClass.hInstance = GetModuleHandleW(NULL);
    windowClass.hCursor = LoadCursor(NULL, IDC_ARROW);
    windowClass.hbrBackground = (HBRUSH)(COLOR_BTNFACE + 1);
    windowClass.lpszClassName = RD_DIALOG_CLASS;
    RegisterClassW(&windowClass);
    dialog.window = CreateWindowExW(WS_EX_DLGMODALFRAME, RD_DIALOG_CLASS, L"Customisations",
        WS_CAPTION | WS_SYSMENU, CW_USEDEFAULT, CW_USEDEFAULT, 560, 625,
        owner, NULL, windowClass.hInstance, &dialog);
    if (!dialog.window) return 0;
    control(dialog.window, L"STATIC", L"Resources", 0, 20, 18, 480, 22, 0);
    dialog.resources = control(dialog.window, L"COMBOBOX", L"", WS_TABSTOP | CBS_DROPDOWNLIST | WS_VSCROLL, 20, 42, 375, 240, 0);
    control(dialog.window, L"BUTTON", L"Add file...", WS_TABSTOP, 405, 42, 115, 27, 100);
    fillResources(&dialog);
    dialog.levels = control(dialog.window, L"BUTTON", L"Start at level", BS_AUTOCHECKBOX | WS_TABSTOP, 20, 90, 185, 25, 0);
    dialog.level = number(dialog.window, settings->level > 0 ? settings->level : 1, 220, 90);
    dialog.start = control(dialog.window, L"BUTTON", L"Override player start Y", BS_AUTOCHECKBOX | WS_TABSTOP, 20, 125, 195, 25, 0);
    dialog.startValue = number(dialog.window, settings->startY, 220, 125);
    dialog.group = control(dialog.window, L"BUTTON", L"Override object group Y", BS_AUTOCHECKBOX | WS_TABSTOP, 20, 160, 195, 25, 0);
    dialog.groupValue = number(dialog.window, settings->objectGroupStartY, 220, 160);
    setChecked(dialog.levels, settings->levelEnabled);
    setChecked(dialog.start, settings->hasStartY);
    setChecked(dialog.group, settings->hasObjectGroupStartY);
    control(dialog.window, L"STATIC", L"Start with add-ons", 0, 20, 205, 480, 22, 0);
    for (int i = 0; i < 4; i++) {
        dialog.addons[i] = control(dialog.window, L"BUTTON", addonNames[i], BS_AUTOCHECKBOX | WS_TABSTOP, 20 + (i % 2) * 255, 232 + (i / 2) * 30, 245, 25, 0);
        setChecked(dialog.addons[i], settings->forcedAddOns & addonMasks[i]);
    }
    control(dialog.window, L"STATIC", L"Disabled bonus rolls", 0, 20, 307, 480, 22, 0);
    for (int i = 0; i < 8; i++) {
        dialog.bonuses[i] = control(dialog.window, L"BUTTON", bonusNames[i], BS_AUTOCHECKBOX | WS_TABSTOP, 20 + (i % 2) * 255, 334 + (i / 2) * 30, 245, 25, 0);
        setChecked(dialog.bonuses[i], settings->disabledBonusRollMask & (1u << i));
    }
    control(dialog.window, L"STATIC", L"Apply restarts the game. Imported packs are saved for future launches.", 0, 20, 475, 500, 40, 0);
    control(dialog.window, L"BUTTON", L"Cancel", WS_TABSTOP, 270, 535, 110, 30, IDCANCEL);
    control(dialog.window, L"BUTTON", L"Apply and restart", BS_DEFPUSHBUTTON | WS_TABSTOP, 390, 535, 130, 30, IDOK);
    if (owner) EnableWindow(owner, FALSE);
    ShowWindow(dialog.window, SW_SHOW);
    while (IsWindow(dialog.window) && GetMessageW(&message, NULL, 0, 0) > 0) {
        if (!IsDialogMessageW(dialog.window, &message)) { TranslateMessage(&message); DispatchMessageW(&message); }
    }
    if (owner) { EnableWindow(owner, TRUE); SetActiveWindow(owner); }
    if (dialog.applied) *settings = dialog.draft;
    return dialog.applied;
}

/* C runtime file APIs need UTF-16 paths on Windows. SDL provides UTF-8 paths. */
static wchar_t *widePath(const char *path)
{
    int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path, -1, NULL, 0);
    if (!count) return NULL;
    wchar_t *result = malloc((size_t)count * sizeof(wchar_t));
    if (!result) return NULL;
    if (!MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path, -1, result, count)) {
        free(result); return NULL;
    }
    return result;
}
FILE *RDWindowsOpenFile(const char *path, const char *mode)
{
    wchar_t *wide = widePath(path), *wideMode = widePath(mode);
    FILE *file = wide && wideMode ? _wfopen(wide, wideMode) : NULL;
    free(wide); free(wideMode);
    return file;
}
int RDWindowsRemoveFile(const char *path)
{
    wchar_t *wide = widePath(path);
    int result = wide ? _wremove(wide) : -1;
    free(wide); return result;
}
int RDWindowsRenameFile(const char *source, const char *destination)
{
    wchar_t *from = widePath(source), *to = widePath(destination);
    int result = from && to && MoveFileExW(from, to, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) ? 0 : -1;
    free(from); free(to); return result;
}
int RDWindowsRestart(void)
{
    wchar_t executable[32768];
    STARTUPINFOW startup = {0};
    PROCESS_INFORMATION process;
    startup.cb = sizeof(startup);
    DWORD length = GetModuleFileNameW(NULL, executable, 32768);
    if (!length || length >= 32768) return 0;
    if (!CreateProcessW(executable, NULL, NULL, NULL, FALSE, 0, NULL, NULL, &startup, &process)) return 0;
    CloseHandle(process.hThread); CloseHandle(process.hProcess);
    return 1;
}
