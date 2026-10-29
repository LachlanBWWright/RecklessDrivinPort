#import <Cocoa/Cocoa.h>
#include <limits.h>
#include <stdio.h>
#include <string.h>
#include "native_customisations.h"

@interface RDCustomisationsController : NSObject {
@public
    RDCustomisations draft;
    NSPopUpButton *resources;
    NSButton *levelEnabled, *startEnabled, *groupEnabled;
    NSTextField *level, *startY, *groupY;
    NSMutableArray<NSButton *> *addons, *bonuses;
}
- (void)importResource:(id)sender;
- (void)refreshResources;
@end

@implementation RDCustomisationsController
- (void)refreshResources
{
    [resources removeAllItems];
    [resources addItemWithTitle:@"Original game"];
    NSInteger selected = 0;
    for (int i = 0; i < RDNativeResourceCount(); i++) {
        NSString *name = [NSString stringWithUTF8String:RDNativeResourceName(i)];
        [resources addItemWithTitle:name ?: @"Resource pack"];
        if (strcmp(draft.resourcePath, RDNativeResourcePath(i)) == 0) selected = i + 1;
    }
    [resources selectItemAtIndex:selected];
}
- (void)importResource:(id)sender
{
    (void)sender;
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.title = @"Add resources.dat";
    panel.canChooseDirectories = NO;
    panel.allowsMultipleSelection = NO;
    panel.allowedFileTypes = @[@"dat"];
    if ([panel runModal] != NSModalResponseOK) return;
    if (!RDNativeImportResource(panel.URL.path.UTF8String, draft.resourcePath, sizeof(draft.resourcePath))) {
        NSAlert *error = [[NSAlert alloc] init];
        error.messageText = @"Could not import resource pack";
        error.informativeText = @"Check that the selected file is a valid resources.dat file.";
        [error runModal];
        return;
    }
    [self refreshResources];
}
@end

static NSTextField *label(NSView *view, NSString *text, CGFloat x, CGFloat y, CGFloat width)
{
    NSTextField *field = [NSTextField labelWithString:text];
    field.frame = NSMakeRect(x, y, width, 22);
    [view addSubview:field];
    return field;
}
static NSButton *checkbox(NSView *view, NSString *title, BOOL enabled, CGFloat x, CGFloat y)
{
    NSButton *button = [NSButton checkboxWithTitle:title target:nil action:nil];
    button.frame = NSMakeRect(x, y, 245, 24);
    button.state = enabled ? NSControlStateValueOn : NSControlStateValueOff;
    [view addSubview:button];
    return button;
}
static NSTextField *number(NSView *view, int value, CGFloat x, CGFloat y)
{
    NSTextField *field = [[NSTextField alloc] initWithFrame:NSMakeRect(x, y, 110, 24)];
    field.stringValue = [NSString stringWithFormat:@"%d", value];
    [view addSubview:field];
    return field;
}
static BOOL readNumber(NSTextField *field, int *value)
{
    NSScanner *scanner = [NSScanner scannerWithString:field.stringValue];
    long long parsed;
    if (![scanner scanLongLong:&parsed] || !scanner.isAtEnd || parsed < INT_MIN || parsed > INT_MAX) return NO;
    *value = (int)parsed;
    return YES;
}
int RDPlatformShowCustomisations(RDCustomisations *settings)
{
    @autoreleasepool {
        RDCustomisationsController *controller = [[RDCustomisationsController alloc] init];
        controller->draft = *settings;
        controller->addons = [NSMutableArray array];
        controller->bonuses = [NSMutableArray array];
        NSAlert *dialog = [[NSAlert alloc] init];
        dialog.messageText = @"Customisations";
        dialog.informativeText = @"Apply restarts the game. Imported resource packs are saved for future launches.";
        [dialog addButtonWithTitle:@"Apply and restart"];
        [dialog addButtonWithTitle:@"Cancel"];
        NSView *view = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 500, 465)];
        label(view, @"Resources", 0, 438, 500);
        controller->resources = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(0, 403, 365, 30) pullsDown:NO];
        [view addSubview:controller->resources];
        NSButton *add = [NSButton buttonWithTitle:@"Add file…" target:controller action:@selector(importResource:)];
        add.frame = NSMakeRect(375, 403, 125, 30);
        [view addSubview:add];
        [controller refreshResources];
        controller->levelEnabled = checkbox(view, @"Start at level", settings->levelEnabled, 0, 358);
        controller->level = number(view, settings->level > 0 ? settings->level : 1, 265, 358);
        controller->startEnabled = checkbox(view, @"Override player start Y", settings->hasStartY, 0, 323);
        controller->startY = number(view, settings->startY, 265, 323);
        controller->groupEnabled = checkbox(view, @"Override object group Y", settings->hasObjectGroupStartY, 0, 288);
        controller->groupY = number(view, settings->objectGroupStartY, 265, 288);
        label(view, @"Start with add-ons", 0, 251, 500);
        NSArray<NSString *> *addonNames = @[@"Lock", @"Police jammer", @"Turbo engine", @"Spikes"];
        unsigned masks[] = {8, 16, 32, 64};
        for (int i = 0; i < 4; i++) {
            NSButton *button = checkbox(view, addonNames[i], (settings->forcedAddOns & masks[i]) != 0, (i % 2) * 250, 223 - (i / 2) * 29);
            [controller->addons addObject:button];
        }
        label(view, @"Disabled bonus rolls", 0, 153, 500);
        NSArray<NSString *> *bonusNames = @[@"Lock", @"Mines", @"Missiles", @"Spikes", @"Police jammer", @"Turbo", @"Score award", @"Extra life"];
        for (int i = 0; i < 8; i++) {
            NSButton *button = checkbox(view, bonusNames[i], (settings->disabledBonusRollMask & (1u << i)) != 0, (i % 2) * 250, 125 - (i / 2) * 29);
            [controller->bonuses addObject:button];
        }
        dialog.accessoryView = view;
        while ([dialog runModal] == NSAlertFirstButtonReturn) {
            RDCustomisations result = controller->draft;
            result.levelEnabled = controller->levelEnabled.state == NSControlStateValueOn;
            result.hasStartY = controller->startEnabled.state == NSControlStateValueOn;
            result.hasObjectGroupStartY = controller->groupEnabled.state == NSControlStateValueOn;
            if ((result.levelEnabled && (!readNumber(controller->level, &result.level) || result.level < 1)) ||
                (result.hasStartY && (!readNumber(controller->startY, &result.startY) || result.startY < 0)) ||
                (result.hasObjectGroupStartY && (!readNumber(controller->groupY, &result.objectGroupStartY) || result.objectGroupStartY < 0))) {
                NSAlert *error = [[NSAlert alloc] init];
                error.messageText = @"Check settings";
                error.informativeText = @"Enter a positive level number and whole-number start positions.";
                [error runModal];
                continue;
            }
            result.forcedAddOns = 0;
            result.disabledBonusRollMask = 0;
            for (int i = 0; i < 4; i++) if (controller->addons[i].state == NSControlStateValueOn) result.forcedAddOns |= masks[i];
            for (int i = 0; i < 8; i++) if (controller->bonuses[i].state == NSControlStateValueOn) result.disabledBonusRollMask |= 1u << i;
            NSInteger selected = controller->resources.indexOfSelectedItem;
            snprintf(result.resourcePath, sizeof(result.resourcePath), "%s", selected > 0 ? RDNativeResourcePath((int)selected - 1) : "");
            *settings = result;
            return 1;
        }
        return 0;
    }
}
