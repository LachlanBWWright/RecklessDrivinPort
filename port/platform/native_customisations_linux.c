/* Native Linux customisations UI. Keep all GTK calls on the SDL main thread. */
#include "native_customisations.h"

#include <gtk/gtk.h>
#include <limits.h>
#include <stdio.h>
#include <string.h>

typedef struct LinuxCustomisationsDialog {
    GtkWidget *dialog;
    GtkWidget *resources;
} LinuxCustomisationsDialog;

static void select_resources(LinuxCustomisationsDialog *state, const char *path)
{
    int count = RDNativeResourceCount();
    int selected = 0;
    gtk_combo_box_text_remove_all(GTK_COMBO_BOX_TEXT(state->resources));
    gtk_combo_box_text_append(GTK_COMBO_BOX_TEXT(state->resources), "", "Original game");
    for (int i = 0; i < count; i++) {
        const char *entryPath = RDNativeResourcePath(i);
        gtk_combo_box_text_append(GTK_COMBO_BOX_TEXT(state->resources), entryPath,
                                  RDNativeResourceName(i));
        if (strcmp(path, entryPath) == 0)
            selected = i + 1;
    }
    /* Keep a command-line resource available even if it is outside the library. */
    if (path[0] && !selected) {
        gchar *name = g_path_get_basename(path);
        gtk_combo_box_text_append(GTK_COMBO_BOX_TEXT(state->resources), path, name);
        g_free(name);
        selected = count + 1;
    }
    gtk_combo_box_set_active(GTK_COMBO_BOX(state->resources), selected);
}

static void import_resources(GtkButton *button, gpointer data)
{
    LinuxCustomisationsDialog *state = data;
    GtkWidget *picker = gtk_file_chooser_dialog_new("Add resources.dat", GTK_WINDOW(state->dialog),
        GTK_FILE_CHOOSER_ACTION_OPEN, "_Cancel", GTK_RESPONSE_CANCEL, "_Add", GTK_RESPONSE_ACCEPT, NULL);
    GtkFileFilter *filter = gtk_file_filter_new();
    (void)button;
    gtk_file_filter_set_name(filter, "Game resources (*.dat)");
    gtk_file_filter_add_pattern(filter, "*.dat");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(picker), filter);
    if (gtk_dialog_run(GTK_DIALOG(picker)) == GTK_RESPONSE_ACCEPT) {
        gchar *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(picker));
        char importedPath[4096];
        if (path && RDNativeImportResource(path, importedPath, sizeof(importedPath))) {
            select_resources(state, importedPath);
        } else {
            GtkWidget *error = gtk_message_dialog_new(GTK_WINDOW(picker), GTK_DIALOG_MODAL,
                GTK_MESSAGE_ERROR, GTK_BUTTONS_CLOSE,
                "Could not add this resource file. Choose a valid resources.dat file and check available storage.");
            gtk_dialog_run(GTK_DIALOG(error));
            gtk_widget_destroy(error);
        }
        g_free(path);
    }
    gtk_widget_destroy(picker);
}

static GtkWidget *number_option(GtkWidget *grid, int row, const char *label, int enabled,
                                int value, int minimum, GtkWidget **toggle)
{
    GtkWidget *spin = gtk_spin_button_new_with_range(minimum, INT_MAX, 1);
    *toggle = gtk_check_button_new_with_label(label);
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(*toggle), enabled != 0);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(spin), value);
    gtk_widget_set_sensitive(spin, enabled != 0);
    g_object_bind_property(*toggle, "active", spin, "sensitive", G_BINDING_SYNC_CREATE);
    gtk_grid_attach(GTK_GRID(grid), *toggle, 0, row, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), spin, 1, row, 1, 1);
    return spin;
}

static GtkWidget *option_section(GtkWidget *box, const char *title)
{
    GtkWidget *frame = gtk_frame_new(title);
    GtkWidget *grid = gtk_grid_new();
    gtk_container_set_border_width(GTK_CONTAINER(grid), 10);
    gtk_grid_set_row_spacing(GTK_GRID(grid), 8);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 18);
    gtk_container_add(GTK_CONTAINER(frame), grid);
    gtk_box_pack_start(GTK_BOX(box), frame, FALSE, FALSE, 0);
    return grid;
}

int RDPlatformShowCustomisations(RDCustomisations *options)
{
    static const char *addonNames[] = {"Lock addons", "Police jammer", "Turbo engine", "Side spikes"};
    static const char *bonusNames[] = {"Lock", "Mines", "Missiles", "Spikes", "Police jammer", "Turbo", "Score award", "Extra life"};
    LinuxCustomisationsDialog state;
    GtkWidget *addons[4], *bonuses[8];
    GtkWidget *levelToggle, *startToggle, *groupToggle;
    GtkWidget *level, *start, *group;
    int applied = 0;
    if (!gtk_init_check(NULL, NULL)) {
        fprintf(stderr, "[RecklessDrivin] Could not initialise GTK customisations dialog.\n");
        return 0;
    }
    memset(&state, 0, sizeof(state));
    state.dialog = gtk_dialog_new_with_buttons("Customisations", NULL, GTK_DIALOG_MODAL,
        "_Cancel", GTK_RESPONSE_CANCEL, "Apply and _restart", GTK_RESPONSE_ACCEPT, NULL);
    gtk_window_set_default_size(GTK_WINDOW(state.dialog), 500, -1);
    gtk_dialog_set_default_response(GTK_DIALOG(state.dialog), GTK_RESPONSE_ACCEPT);
    GtkWidget *box = gtk_dialog_get_content_area(GTK_DIALOG(state.dialog));
    gtk_container_set_border_width(GTK_CONTAINER(box), 16);
    gtk_box_set_spacing(GTK_BOX(box), 12);
    GtkWidget *resourceGrid = option_section(box, "Resources");
    state.resources = gtk_combo_box_text_new();
    gtk_widget_set_hexpand(state.resources, TRUE);
    select_resources(&state, options->resourcePath);
    gtk_grid_attach(GTK_GRID(resourceGrid), state.resources, 0, 0, 1, 1);
    GtkWidget *add = gtk_button_new_with_label("Add file…");
    g_signal_connect(add, "clicked", G_CALLBACK(import_resources), &state);
    gtk_grid_attach(GTK_GRID(resourceGrid), add, 1, 0, 1, 1);
    GtkWidget *hint = gtk_label_new("Added files are copied and kept for future launches.");
    gtk_label_set_line_wrap(GTK_LABEL(hint), TRUE);
    gtk_label_set_xalign(GTK_LABEL(hint), 0);
    gtk_grid_attach(GTK_GRID(resourceGrid), hint, 0, 1, 2, 1);
    GtkWidget *launchGrid = option_section(box, "Starting position");
    level = number_option(launchGrid, 0, "Start at level", options->levelEnabled,
                          options->level > 0 ? options->level : 1, 1, &levelToggle);
    start = number_option(launchGrid, 1, "Override player start Y", options->hasStartY,
                          options->startY, 0, &startToggle);
    group = number_option(launchGrid, 2, "Override object-group Y floor", options->hasObjectGroupStartY,
                          options->objectGroupStartY, 0, &groupToggle);
    GtkWidget *addonGrid = option_section(box, "Forced addons");
    for (int i = 0; i < 4; i++) {
        addons[i] = gtk_check_button_new_with_label(addonNames[i]);
        gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(addons[i]), (options->forcedAddOns & (1u << (i + 3))) != 0);
        gtk_grid_attach(GTK_GRID(addonGrid), addons[i], i % 2, i / 2, 1, 1);
    }
    GtkWidget *bonusGrid = option_section(box, "Disabled bonus rolls");
    for (int i = 0; i < 8; i++) {
        bonuses[i] = gtk_check_button_new_with_label(bonusNames[i]);
        gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(bonuses[i]), (options->disabledBonusRollMask & (1u << i)) != 0);
        gtk_grid_attach(GTK_GRID(bonusGrid), bonuses[i], i % 2, i / 2, 1, 1);
    }
    gtk_widget_show_all(state.dialog);
    if (gtk_dialog_run(GTK_DIALOG(state.dialog)) == GTK_RESPONSE_ACCEPT) {
        const char *path = gtk_combo_box_get_active_id(GTK_COMBO_BOX(state.resources));
        options->levelEnabled = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(levelToggle));
        options->level = gtk_spin_button_get_value_as_int(GTK_SPIN_BUTTON(level));
        options->hasStartY = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(startToggle));
        options->startY = gtk_spin_button_get_value_as_int(GTK_SPIN_BUTTON(start));
        options->hasObjectGroupStartY = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(groupToggle));
        options->objectGroupStartY = gtk_spin_button_get_value_as_int(GTK_SPIN_BUTTON(group));
        options->forcedAddOns &= ~0x78u;
        options->disabledBonusRollMask &= ~0xffu;
        for (int i = 0; i < 4; i++)
            if (gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(addons[i])))
                options->forcedAddOns |= 1u << (i + 3);
        for (int i = 0; i < 8; i++)
            if (gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(bonuses[i])))
                options->disabledBonusRollMask |= 1u << i;
        snprintf(options->resourcePath, sizeof(options->resourcePath), "%s", path ? path : "");
        applied = 1;
    }
    gtk_widget_destroy(state.dialog);
    while (gtk_events_pending())
        gtk_main_iteration();
    return applied;
}
