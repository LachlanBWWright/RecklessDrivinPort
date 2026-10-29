package com.recklessdrivin;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Process;

/** Runs outside the SDL process, so applying resources always starts clean native state. */
public final class RestartActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        int gamePid = getIntent().getIntExtra("gamePid", -1);
        if (gamePid > 0 && gamePid != Process.myPid()) Process.killProcess(gamePid);
        Intent game = new Intent(this, MainActivity.class);
        game.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(game);
        finish();
    }
}
