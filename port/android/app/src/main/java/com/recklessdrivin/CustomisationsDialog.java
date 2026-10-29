package com.recklessdrivin;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CountDownLatch;

/** Native Android controls and a private, persistent library of imported resource packs. */
final class CustomisationsDialog {
    private static final int IMPORT_REQUEST = 4271;
    private static final long MAX_PACK_BYTES = 128L * 1024 * 1024;
    private final MainActivity activity;
    private final CountDownLatch finished = new CountDownLatch(1);
    private final List<String> resourcePaths = new ArrayList<>();
    private Spinner resources;
    private TextView status;
    private AlertDialog dialog;
    private volatile String[] result;
    private volatile boolean closed;
    private Button importButton;

    CustomisationsDialog(MainActivity activity) { this.activity = activity; }

    String[] showAndWait(int[] values, String path) {
        activity.runOnUiThread(() -> {
            if (!closed && !activity.isFinishing()) show(values, path);
            else cancel();
        });
        try { finished.await(); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); cancel(); }
        return result;
    }

    void cancel() {
        closed = true;
        finished.countDown();
    }

    private LinearLayout column() {
        LinearLayout layout = new LinearLayout(activity);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    private void heading(LinearLayout parent, String text) {
        TextView view = new TextView(activity);
        view.setText(text);
        view.setTextSize(18);
        view.setPadding(0, 20, 0, 6);
        parent.addView(view);
    }

    private CheckBox checkbox(LinearLayout parent, String title, boolean checked) {
        CheckBox box = new CheckBox(activity);
        box.setText(title);
        box.setChecked(checked);
        parent.addView(box);
        return box;
    }

    private EditText number(LinearLayout parent, String title, int value, CheckBox enabled) {
        EditText edit = new EditText(activity);
        edit.setSingleLine(true);
        edit.setHint(title);
        edit.setContentDescription(title);
        edit.setInputType(InputType.TYPE_CLASS_NUMBER);
        edit.setText(Integer.toString(value));
        edit.setEnabled(enabled.isChecked());
        enabled.setOnCheckedChangeListener((button, checked) -> edit.setEnabled(checked));
        parent.addView(edit);
        return edit;
    }

    private void show(int[] values, String path) {
        LinearLayout content = column();
        int padding = (int) (20 * activity.getResources().getDisplayMetrics().density);
        content.setPadding(padding, 0, padding, padding);
        heading(content, "Resources");
        resources = new Spinner(activity);
        content.addView(resources);
        refreshResources(path);
        LinearLayout actions = new LinearLayout(activity);
        importButton = new Button(activity);
        importButton.setText("Add file…");
        importButton.setOnClickListener(view -> {
            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("*/*");
            activity.startActivityForResult(picker, IMPORT_REQUEST);
        });
        actions.addView(importButton);
        Button remove = new Button(activity);
        remove.setText("Remove saved file");
        remove.setOnClickListener(view -> {
            int selected = resources.getSelectedItemPosition();
            if (selected <= 0) return;
            File file = new File(resourcePaths.get(selected));
            new AlertDialog.Builder(activity).setTitle("Remove saved resource pack?")
                    .setMessage("This removes the imported copy from this app.")
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("Remove", (confirmation, which) -> {
                        if (file.delete()) {
                            names().edit().remove(file.getName()).apply();
                            refreshResources("");
                        } else status.setText("Could not remove this resource pack.");
                    }).show();
        });
        actions.addView(remove);
        content.addView(actions);
        status = new TextView(activity);
        status.setText("Imported files are saved on this device for future launches.");
        content.addView(status);

        heading(content, "Starting position");
        CheckBox levelEnabled = checkbox(content, "Start directly at a level", values[0] != 0);
        EditText level = number(content, "Level number (1 or greater)", values[1], levelEnabled);
        CheckBox startEnabled = checkbox(content, "Override player start Y", values[2] != 0);
        EditText start = number(content, "Player start Y", values[3], startEnabled);
        CheckBox groupEnabled = checkbox(content, "Override object-group start Y", values[4] != 0);
        EditText group = number(content, "Object-group start Y", values[5], groupEnabled);
        heading(content, "Starting add-ons");
        String[] addonNames = {"Lock", "Police jammer", "Turbo engine", "Spikes"};
        CheckBox[] addons = new CheckBox[addonNames.length];
        for (int i = 0; i < addons.length; i++)
            addons[i] = checkbox(content, addonNames[i], (values[6] & (1 << (i + 3))) != 0);
        heading(content, "Disable bonus rolls");
        String[] bonusNames = {"Lock", "Mines", "Missiles", "Spikes", "Police jammer",
                "Turbo", "Score award", "Extra life"};
        CheckBox[] bonuses = new CheckBox[bonusNames.length];
        for (int i = 0; i < bonuses.length; i++)
            bonuses[i] = checkbox(content, bonusNames[i], (values[7] & (1 << i)) != 0);
        ScrollView scroll = new ScrollView(activity);
        scroll.addView(content);
        dialog = new AlertDialog.Builder(activity).setTitle("Customisations")
                .setView(scroll).setNegativeButton("Cancel", (view, which) -> cancel())
                .setPositiveButton("Apply and restart", null).create();
        dialog.setOnCancelListener(view -> cancel());
        dialog.setOnDismissListener(view -> cancel());
        dialog.setCanceledOnTouchOutside(false);
        dialog.setOnShowListener(view -> dialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(button -> {
                    try {
                        int levelValue = parseNumber(level, levelEnabled.isChecked(), 1);
                        int startValue = parseNumber(start, startEnabled.isChecked(), 0);
                        int groupValue = parseNumber(group, groupEnabled.isChecked(), 0);
                        int addonMask = 0, bonusMask = 0;
                        for (int i = 0; i < addons.length; i++)
                            if (addons[i].isChecked()) addonMask |= 1 << (i + 3);
                        for (int i = 0; i < bonuses.length; i++)
                            if (bonuses[i].isChecked()) bonusMask |= 1 << i;
                        result = new String[]{levelEnabled.isChecked() ? "1" : "0",
                                Integer.toString(levelValue), startEnabled.isChecked() ? "1" : "0",
                                Integer.toString(startValue), groupEnabled.isChecked() ? "1" : "0",
                                Integer.toString(groupValue), Integer.toString(addonMask),
                                Integer.toString(bonusMask),
                                resourcePaths.get(resources.getSelectedItemPosition())};
                        dialog.dismiss();
                    } catch (NumberFormatException error) {
                        status.setText("Enter whole numbers: level must be at least 1, Y positions at least 0.");
                    }
                }));
        dialog.show();
    }

    private int parseNumber(EditText edit, boolean enabled, int minimum) {
        if (!enabled) return minimum;
        int value = Integer.parseInt(edit.getText().toString().trim());
        if (value < minimum) throw new NumberFormatException();
        return value;
    }

    private SharedPreferences names() {
        return activity.getSharedPreferences("resource-library", Activity.MODE_PRIVATE);
    }

    private File library() { return new File(activity.getFilesDir(), "resource-library"); }

    private void refreshResources(String selectedPath) {
        List<String> labels = new ArrayList<>();
        resourcePaths.clear();
        labels.add("Original game");
        resourcePaths.add("");
        File[] files = library().listFiles((directory, name) -> name.endsWith(".dat"));
        if (files != null) {
            Arrays.sort(files, Comparator.comparing(File::getName));
            for (File file : files) {
                labels.add(names().getString(file.getName(), file.getName()));
                resourcePaths.add(file.getAbsolutePath());
            }
        }
        ArrayAdapter<String> adapter = new ArrayAdapter<>(activity,
                android.R.layout.simple_spinner_item, labels);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        resources.setAdapter(adapter);
        int index = resourcePaths.indexOf(selectedPath);
        resources.setSelection(Math.max(0, index));
    }

    void onActivityResult(int request, int resultCode, Intent data) {
        if (request != IMPORT_REQUEST || resultCode != Activity.RESULT_OK || data == null ||
                data.getData() == null || closed) return;
        Uri uri = data.getData();
        importButton.setEnabled(false);
        status.setText("Importing resource pack…");
        new Thread(() -> {
            String error = null;
            File imported = null;
            try { imported = importResource(uri); }
            catch (IOException | NoSuchAlgorithmException | SecurityException failure) { error = failure.getMessage(); }
            File saved = imported;
            String message = error;
            activity.runOnUiThread(() -> {
                if (closed) return;
                importButton.setEnabled(true);
                if (saved != null) {
                    refreshResources(saved.getAbsolutePath());
                    status.setText("Resource pack saved. Select Apply and restart to play.");
                } else status.setText("Import failed: " + message);
            });
        }, "resource-import").start();
    }

    private File importResource(Uri uri) throws IOException, NoSuchAlgorithmException {
        File directory = library();
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create library.");
        String displayName = "Custom resources.dat";
        try (Cursor cursor = activity.getContentResolver().query(uri,
                new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) displayName = cursor.getString(0);
        }
        File temporary = File.createTempFile("import-", ".tmp", directory);
        try {
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            try (InputStream in = activity.getContentResolver().openInputStream(uri);
                 FileOutputStream out = new FileOutputStream(temporary)) {
                if (in == null) throw new IOException("Cannot open selected file.");
                byte[] buffer = new byte[65536];
                long total = 0;
                int size;
                while ((size = in.read(buffer)) != -1) {
                    total += size;
                    if (total > MAX_PACK_BYTES) throw new IOException("File exceeds 128 MB.");
                    hash.update(buffer, 0, size);
                    out.write(buffer, 0, size);
                }
            }
            validateResource(temporary);
            StringBuilder hex = new StringBuilder();
            for (byte item : hash.digest()) hex.append(String.format(java.util.Locale.ROOT, "%02x", item & 255));
            File destination = new File(directory, hex + ".dat");
            if (!destination.exists() && !temporary.renameTo(destination))
                throw new IOException("Cannot save imported file.");
            names().edit().putString(destination.getName(), displayName).apply();
            return destination;
        } finally { temporary.delete(); }
    }

    private void validateResource(File file) throws IOException {
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            int records = 0;
            while (input.getFilePointer() < input.length()) {
                if (input.length() - input.getFilePointer() < 16) throw new IOException("Incomplete resource header.");
                byte[] header = new byte[16];
                input.readFully(header);
                for (int i = 0; i < 4; i++)
                    if (header[i] < 32 || header[i] > 126) throw new IOException("Invalid resource type.");
                long size = (header[12] & 255L) | ((header[13] & 255L) << 8) |
                        ((header[14] & 255L) << 16) | ((header[15] & 255L) << 24);
                if (size > input.length() - input.getFilePointer()) throw new IOException("Incomplete resource data.");
                input.seek(input.getFilePointer() + size);
                records++;
            }
            if (records == 0) throw new IOException("Empty resource file.");
        }
    }
}
