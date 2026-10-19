package com.recklessdrivin;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.app.ApplicationExitInfo;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/** Reports locally saved Java exceptions and Android's native crash records. */
final class CrashReports {
    private static final String JAVA_REPORT = "last-java-crash.txt";
    private static final int MAX_TRACE_BYTES = 2 * 1024 * 1024;
    private static boolean installed;

    private CrashReports() {}

    static void install(Context context) {
        if (installed) return;
        installed = true;
        Context app = context.getApplicationContext();
        Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try (FileOutputStream output = app.openFileOutput(JAVA_REPORT, Context.MODE_PRIVATE)) {
                String report = "Java exception on " + thread.getName() + "\n" + Log.getStackTraceString(error);
                output.write(report.getBytes(StandardCharsets.UTF_8));
            } catch (IOException ignored) {
                // Preserve Android's normal crash handling even if storage is full.
            } finally {
                if (previous != null) previous.uncaughtException(thread, error);
                else {
                    android.os.Process.killProcess(android.os.Process.myPid());
                    System.exit(1);
                }
            }
        });
    }

    static void showPreviousCrash(Activity activity) {
        // Reading Android's tombstone can involve disk I/O; keep it off the UI thread.
        new Thread(() -> {
            SharedPreferences preferences = activity.getSharedPreferences("crash-reports", Context.MODE_PRIVATE);
            long seen = preferences.getLong("last-shown", 0);
            File javaFile = new File(activity.getFilesDir(), JAVA_REPORT);
            long timestamp = javaFile.exists() ? javaFile.lastModified() : 0;
            String details = "";
            if (timestamp > seen) {
                try (InputStream input = new FileInputStream(javaFile)) {
                    details = new String(readLimited(input), StandardCharsets.UTF_8);
                } catch (IOException error) {
                    Log.w("CrashReports", "Cannot read saved exception", error);
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    ActivityManager manager = activity.getSystemService(ActivityManager.class);
                    if (manager != null) {
                        for (ApplicationExitInfo exit : manager.getHistoricalProcessExitReasons(null, 0, 16)) {
                            if (!activity.getPackageName().equals(exit.getProcessName())) continue;
                            int reason = exit.getReason();
                            if (reason != ApplicationExitInfo.REASON_CRASH_NATIVE &&
                                    reason != ApplicationExitInfo.REASON_CRASH && reason != ApplicationExitInfo.REASON_ANR) continue;
                            if (exit.getTimestamp() <= seen || exit.getTimestamp() < timestamp) continue;
                            // Prefer the saved Java stack to the system's short Java description.
                            if (reason == ApplicationExitInfo.REASON_CRASH && !details.isEmpty()) break;
                            timestamp = exit.getTimestamp();
                            details = reason == ApplicationExitInfo.REASON_CRASH_NATIVE ? "Native game crash" :
                                    reason == ApplicationExitInfo.REASON_ANR ? "Game stopped responding" : "Java exception";
                            details += "\nSignal/status: " + exit.getStatus() + "\n" + exit.getDescription();
                            try (InputStream trace = exit.getTraceInputStream()) {
                                if (trace != null) {
                                    byte[] bytes = readLimited(trace);
                                    details += "\n\n" + (reason == ApplicationExitInfo.REASON_CRASH_NATIVE ?
                                            NativeCrashDetails.describe(bytes) : new String(bytes, StandardCharsets.UTF_8));
                                }
                            } catch (IOException error) {
                                details += "\nFull backtrace unavailable: " + error.getMessage();
                            }
                            break;
                        }
                    }
                } catch (RuntimeException error) {
                    Log.w("CrashReports", "Android crash history unavailable", error);
                }
            }
            if (details.isEmpty() || timestamp <= seen) return;
            String version = "unknown";
            try {
                version = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
            } catch (android.content.pm.PackageManager.NameNotFoundException ignored) { }
            String report = "Installed version: Reckless Drivin' " + version + "\nAndroid " + Build.VERSION.RELEASE +
                    " / " + Build.MANUFACTURER + " " + Build.MODEL + "\n" + new Date(timestamp) + "\n\n" + details;
            long reportedTimestamp = timestamp;
            activity.runOnUiThread(() -> {
                if (activity.isFinishing() || activity.isDestroyed()) return;
                TextView text = new TextView(activity);
                text.setText("The previous session crashed. These details can help diagnose it.\n\n" + report);
                text.setTextIsSelectable(true);
                text.setTextSize(13);
                int padding = (int)(20 * activity.getResources().getDisplayMetrics().density);
                text.setPadding(padding, padding, padding, padding);
                ScrollView scroll = new ScrollView(activity);
                scroll.addView(text);
                AlertDialog dialog = new AlertDialog.Builder(activity)
                        .setTitle("Previous game crash")
                        .setView(scroll)
                        .setPositiveButton("Continue", null)
                        .setNeutralButton("Copy details", null)
                        .create();
                dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(view -> {
                    ClipboardManager clipboard = activity.getSystemService(ClipboardManager.class);
                    if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("Game crash", report));
                    dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setText("Copied");
                }));
                dialog.setOnDismissListener(ignored -> {
                    preferences.edit().putLong("last-shown", reportedTimestamp).apply();
                    if (javaFile.exists() && javaFile.lastModified() <= reportedTimestamp) javaFile.delete();
                });
                dialog.show();
            });
        }, "crash-report-reader").start();
    }

    private static byte[] readLimited(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (output.size() + count > MAX_TRACE_BYTES) throw new IOException("Crash trace exceeds size limit");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }
}
