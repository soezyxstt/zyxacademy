package com.zyx.academy;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String DEFAULT_CHANNEL_ID = "zyx_default";
    private static final int LIGHT_SYSTEM_BAR_BG = 0xFFFFFFFF;
    private static final int DARK_SYSTEM_BAR_BG = 0xFF1D1D1D;

    static final class WebViewMargins {
        final int left;
        final int top;
        final int right;
        final int bottom;

        WebViewMargins(int left, int top, int right, int bottom) {
            this.left = left;
            this.top = top;
            this.right = right;
            this.bottom = bottom;
        }
    }

    static WebViewMargins computeWebViewMargins(Insets bars, Insets ime) {
        return new WebViewMargins(
            Math.max(0, bars.left),
            Math.max(0, bars.top),
            Math.max(0, bars.right),
            Math.max(0, Math.max(bars.bottom, ime.bottom))
        );
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZyxAppUpdaterPlugin.class);
        registerPlugin(ZyxOfflineStorePlugin.class);
        super.onCreate(savedInstanceState);
        applySystemBarInsets();
        createDefaultNotificationChannel();
    }

    @Override
    public void onResume() {
        super.onResume();
        updateSystemBarAppearance();
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            ViewCompat.requestApplyInsets(webView);
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        updateSystemBarAppearance();
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            ViewCompat.requestApplyInsets(webView);
        }
    }

    private boolean isDarkTheme() {
        int mode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }

    private void updateSystemBarAppearance() {
        boolean dark = isDarkTheme();
        int bgColor = dark ? DARK_SYSTEM_BAR_BG : LIGHT_SYSTEM_BAR_BG;
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            ViewParent parent = webView.getParent();
            if (parent instanceof View) {
                ((View) parent).setBackgroundColor(bgColor);
            }
        }
        View decorView = getWindow().getDecorView();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decorView);
        if (controller != null) {
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
        }
    }

    private void applyMarginsToWebView(WebView webView, WindowInsetsCompat windowInsets) {
        Insets bars = windowInsets.getInsets(
            WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
        );
        Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
        WebViewMargins margins = computeWebViewMargins(bars, ime);

        ViewGroup.LayoutParams rawParams = webView.getLayoutParams();
        if (rawParams instanceof ViewGroup.MarginLayoutParams) {
            ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) rawParams;
            if (
                mlp.leftMargin != margins.left
                    || mlp.topMargin != margins.top
                    || mlp.rightMargin != margins.right
                    || mlp.bottomMargin != margins.bottom
            ) {
                mlp.leftMargin = margins.left;
                mlp.topMargin = margins.top;
                mlp.rightMargin = margins.right;
                mlp.bottomMargin = margins.bottom;
                webView.setLayoutParams(mlp);
            }
        }
    }

    private void applySystemBarInsets() {
        // Use a single consistent edge-to-edge coordinate space across Android 10 to 16,
        // then physically inset the CapacitorWebView via MarginLayoutParams (never android.R.id.content,
        // whose padding AppCompat resets via ContentFrameLayout.setDecorPadding).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        updateSystemBarAppearance();

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            applyMarginsToWebView(webView, windowInsets);
            return WindowInsetsCompat.CONSUMED;
        });

        webView.post(() -> {
            WindowInsetsCompat rootInsets = ViewCompat.getRootWindowInsets(webView);
            if (rootInsets != null) {
                applyMarginsToWebView(webView, rootInsets);
            }
            ViewCompat.requestApplyInsets(webView);
        });
    }

    private void createDefaultNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                DEFAULT_CHANNEL_ID,
                "Zyx Academy",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Notifikasi pembelajaran dan pengumuman Zyx Academy");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
