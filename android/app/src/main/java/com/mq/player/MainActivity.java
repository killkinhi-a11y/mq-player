package com.mq.player;

import android.os.Bundle;
import android.view.WindowManager;
import android.graphics.Color;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Status bar — transparent, dark theme
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        getWindow().setStatusBarColor(Color.parseColor("#0e0e0e"));
        getWindow().setNavigationBarColor(Color.parseColor("#0e0e0e"));

        // Keep screen on while app is foreground (useful for music playback)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    public void onBackPressed() {
        // Let WebView handle back press first (history navigation)
        if (bridge != null && bridge.getWebView() != null) {
            if (bridge.getWebView().canGoBack()) {
                bridge.getWebView().goBack();
                return;
            }
        }
        // Otherwise default behavior (minimize app)
        super.onBackPressed();
    }
}
