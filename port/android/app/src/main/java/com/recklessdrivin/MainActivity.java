package com.recklessdrivin;

import org.libsdl.app.SDLActivity;
import android.os.Bundle;
import android.content.res.AssetManager;
import java.io.*;

/**
 * MainActivity extends SDL2's SDLActivity which handles all the Android
 * lifecycle, window creation, OpenGL ES surface, and event dispatching.
 *
 * On first launch we copy resources.dat from the APK assets into the
 * app's private files directory so the native C code can open it with
 * a plain fopen() call.
 */
public class MainActivity extends SDLActivity {

    private static final String RESOURCES_DAT = "resources.dat";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        copyAssetIfNeeded(RESOURCES_DAT);
        super.onCreate(savedInstanceState);
    }

    /** Tell SDL2 which native libraries to load (order matters). */
    @Override
    protected String[] getLibraries() {
        return new String[]{ "SDL2", "main" };
    }

    /**
     * Copy a file from APK assets to the app's internal files directory
     * if it doesn't already exist there.
     */
    private void copyAssetIfNeeded(String filename) {
        File dest = new File(getFilesDir(), filename);
        if (dest.exists()) return;

        AssetManager am = getAssets();
        try (InputStream in  = am.open(filename);
             OutputStream out = new FileOutputStream(dest)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        } catch (IOException e) {
            // Log but don't crash – the game will show an error dialog if needed
            android.util.Log.e("RecklessDrivin", "Failed to copy " + filename, e);
        }
    }
}
