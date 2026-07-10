package com.zyx.academy.bridge

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import androidx.browser.customtabs.CustomTabsIntent
import com.zyx.academy.BuildConfig

/**
 * Exposed to the web app as window.ZyxNative.
 * Web side must feature-detect: typeof window.ZyxNative !== "undefined".
 * Methods run on a WebView-managed background thread; hop to main where needed.
 */
class ZyxBridge(
    private val context: Context,
    private val onRequestPushPermission: () -> Unit,
) {

    @JavascriptInterface
    fun getPlatform(): String = "android"

    @JavascriptInterface
    fun getAppVersion(): String = BuildConfig.VERSION_NAME

    /** Replaces the web FCM flow in components/notifications/push-permission-init.tsx */
    @JavascriptInterface
    fun requestPushPermission() {
        onRequestPushPermission()
    }

    /** Fallback for navigator.clipboard on older WebViews (copy code button, tokens) */
    @JavascriptInterface
    fun copyToClipboard(text: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("Zyx", text))
    }

    @JavascriptInterface
    fun share(text: String, url: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, if (url.isBlank()) text else "$text\n$url")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(Intent.createChooser(intent, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    @JavascriptInterface
    fun openExternal(url: String) {
        if (!url.startsWith("https://")) return
        CustomTabsIntent.Builder().build().apply {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }.launchUrl(context, Uri.parse(url))
    }
}
