package com.myworld.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

/**
 * The web app fills the whole window.
 *
 * Android 15 and newer draw every app edge to edge, so the system bars sit on
 * top of the app. The WebView is padded by the size of those bars here, which
 * keeps every screen of the app fully visible without touching the layout the
 * web app already draws. The keyboard is handled the same way, so the field
 * that is being typed into is never hidden behind it.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        View webView = findViewById(com.getcapacitor.android.R.id.webview);
        if (webView == null) {
            return;
        }

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets keyboard = windowInsets.getInsets(WindowInsetsCompat.Type.ime());

            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));

            return WindowInsetsCompat.CONSUMED;
        });
    }
}
