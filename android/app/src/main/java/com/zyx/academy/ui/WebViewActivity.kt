package com.zyx.academy.ui

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.zyx.academy.BuildConfig
import com.zyx.academy.ZyxApp
import com.zyx.academy.bridge.ZyxBridge
import com.zyx.academy.databinding.ActivityWebviewBinding
import kotlinx.coroutines.launch

/**
 * Single WebView screen. Route passed via EXTRA_PATH; singleTop so re-selecting
 * a tile reuses this instance (onNewIntent loads the new route).
 */
class WebViewActivity : AppCompatActivity() {

    companion object {
        private const val EXTRA_PATH = "path"
        private val APP_ORIGIN = Uri.parse(BuildConfig.BASE_URL)

        fun intent(context: Context, path: String): Intent =
            Intent(context, WebViewActivity::class.java).putExtra(EXTRA_PATH, path)
    }

    private lateinit var binding: ActivityWebviewBinding

    private var mainFrameFailed = false
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val uris = if (result.resultCode == Activity.RESULT_OK) {
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            } else null
            fileChooserCallback?.onReceiveValue(uris ?: emptyArray())
            fileChooserCallback = null
        }

    private val pushPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            // TODO Phase 5: on grant, fetch native FCM token and POST to
            // /api/notifications/register-token with the session cookie
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityWebviewBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // targetSdk 35 draws edge-to-edge; keep content out of the status/nav bars
        // and resize for the keyboard (tutor chat input)
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(binding.root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        setupWebView()
        setupBackHandling()
        setupOfflineHandling()

        loadRoute(intent.getStringExtra(EXTRA_PATH) ?: "/dashboard")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_PATH)?.let { loadRoute(it) }
    }

    private fun loadRoute(path: String) {
        mainFrameFailed = false
        binding.offlineView.visibility = View.GONE
        binding.loadingView.root.visibility = View.VISIBLE
        binding.webView.visibility = View.INVISIBLE
        startLogoAnimation()
        binding.webView.loadUrl(BuildConfig.BASE_URL + path)

        // Live quiz sessions keep the screen awake (checklist Phase 7)
        if (path.contains("/live")) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    /** Plays the website's logo draw animation, looping while the overlay is visible */
    private fun startLogoAnimation() {
        val avd = binding.loadingView.loadingLogo.drawable
            as? android.graphics.drawable.AnimatedVectorDrawable ?: return
        avd.registerAnimationCallback(object :
            android.graphics.drawable.Animatable2.AnimationCallback() {
            override fun onAnimationEnd(drawable: android.graphics.drawable.Drawable) {
                if (binding.loadingView.root.visibility == View.VISIBLE) avd.start()
                else avd.unregisterAnimationCallback(this)
            }
        })
        avd.start()
    }

    private fun setupWebView() {
        val webView = binding.webView

        // Match the theme background so pre-paint frames are not black/white flashes
        val tv = android.util.TypedValue()
        theme.resolveAttribute(android.R.attr.colorBackground, tv, true)
        webView.setBackgroundColor(tv.data)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true            // quiz progress, reader prefs, theme
            mediaPlaybackRequiresUserGesture = false
            // App marker consumed by web-side isNativeApp(); keep Chrome UA prefix
            userAgentString = "$userAgentString ZyxApp/${BuildConfig.VERSION_NAME} (Android)"
        }

        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.addJavascriptInterface(
            ZyxBridge(this) {
                runOnUiThread {
                    if (Build.VERSION.SDK_INT >= 33) {
                        pushPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                }
            },
            "ZyxNative"
        )

        webView.webViewClient = object : WebViewClient() {

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                val url = request.url
                // Treat apex and www as the same site (apex 301s to www)
                val sameOrigin = url.host?.removePrefix("www.") ==
                    APP_ORIGIN.host?.removePrefix("www.")

                // Session expired: proxy.ts redirects protected routes to /sign-in
                if (sameOrigin && url.path?.startsWith("/sign-in") == true) {
                    startActivity(Intent(this@WebViewActivity, SignInActivity::class.java))
                    finish()
                    return true
                }

                // Student app scope: admin and tutor surfaces stay in the browser
                val blockedInApp = url.path?.startsWith("/admin") == true ||
                    url.path?.startsWith("/tutor") == true

                if (sameOrigin && !blockedInApp) return false // load in WebView

                openExternally(url)
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                binding.pageProgress.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView, url: String) {
                binding.pageProgress.visibility = View.GONE
                if (!mainFrameFailed) {
                    binding.offlineView.visibility = View.GONE
                    binding.loadingView.root.visibility = View.GONE
                    binding.webView.visibility = View.VISIBLE
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                // Only main-frame failures flip to the native offline screen;
                // subresource errors (an image, a font) must not blank the page
                if (request.isForMainFrame) {
                    mainFrameFailed = true
                    binding.webView.visibility = View.INVISIBLE
                    binding.loadingView.root.visibility = View.GONE
                    binding.offlineView.visibility = View.VISIBLE
                    binding.pageProgress.visibility = View.GONE
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {

            override fun onProgressChanged(view: WebView, newProgress: Int) {
                binding.pageProgress.progress = newProgress
                binding.pageProgress.visibility =
                    if (newProgress in 1..99) View.VISIBLE else View.GONE
            }

            // material-viewer.tsx fullscreen button lands here
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                fullscreenCallback?.onCustomViewHidden()
                fullscreenCallback = callback
                binding.fullscreenContainer.addView(view)
                binding.fullscreenContainer.visibility = View.VISIBLE
                setImmersiveMode(true)
            }

            override fun onHideCustomView() {
                binding.fullscreenContainer.removeAllViews()
                binding.fullscreenContainer.visibility = View.GONE
                fullscreenCallback = null
                setImmersiveMode(false)
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams,
            ): Boolean {
                fileChooserCallback?.onReceiveValue(emptyArray())
                fileChooserCallback = filePathCallback
                return runCatching {
                    fileChooserLauncher.launch(fileChooserParams.createIntent())
                    true
                }.getOrElse {
                    fileChooserCallback = null
                    false
                }
            }
        }

        // Diktat PDFs and other https downloads go to DownloadManager with session cookie
        webView.setDownloadListener(DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            if (!url.startsWith("https://")) return@DownloadListener
            val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val request = DownloadManager.Request(Uri.parse(url))
                .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                .addRequestHeader("User-Agent", userAgent)
                .setMimeType(mimeType)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        })
    }

    private fun setupBackHandling() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    fullscreenCallback != null ->
                        binding.webView.webChromeClient?.onHideCustomView()
                    binding.webView.canGoBack() && binding.offlineView.visibility != View.VISIBLE ->
                        binding.webView.goBack()
                    else -> finish() // back to native grid
                }
            }
        })
    }

    private fun setupOfflineHandling() {
        binding.retryButton.setOnClickListener { retry() }

        // Auto-recover: reload as soon as connectivity returns while offline view is up
        val monitor = (application as ZyxApp).networkMonitor
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                monitor.isOnline.collect { online ->
                    if (online && binding.offlineView.visibility == View.VISIBLE) retry()
                }
            }
        }
    }

    private fun retry() {
        mainFrameFailed = false
        binding.offlineView.visibility = View.GONE
        binding.webView.visibility = View.VISIBLE
        binding.webView.reload()
    }

    private fun openExternally(url: Uri) {
        runCatching {
            if (url.scheme == "https") {
                CustomTabsIntent.Builder().build().launchUrl(this, url)
            } else {
                startActivity(Intent(Intent.ACTION_VIEW, url))
            }
        }
    }

    private fun setImmersiveMode(enabled: Boolean) {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (enabled) {
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    override fun onPause() {
        super.onPause()
        binding.webView.onPause()
        CookieManager.getInstance().flush() // session survives process death
    }

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
    }

    override fun onDestroy() {
        binding.webView.destroy()
        super.onDestroy()
    }
}
