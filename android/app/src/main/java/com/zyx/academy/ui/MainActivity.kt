package com.zyx.academy.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.zyx.academy.auth.AuthManager
import kotlinx.coroutines.launch

/**
 * Launcher gate. No UI of its own: holds the splash (website logo draw
 * animation) while probing the Better Auth session, then hands off to the
 * web UI (WebViewActivity) or native sign-in.
 */
class MainActivity : AppCompatActivity() {

    private var sessionChecked = false

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)

        splash.setKeepOnScreenCondition { !sessionChecked }

        val authManager = AuthManager(applicationContext)
        lifecycleScope.launch {
            val hasSession = authManager.hasValidSession()
            sessionChecked = true
            startActivity(
                if (hasSession) WebViewActivity.intent(this@MainActivity, "/dashboard")
                else Intent(this@MainActivity, SignInActivity::class.java)
            )
            finish()
        }
    }
}
