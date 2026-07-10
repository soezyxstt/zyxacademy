package com.zyx.academy

import android.app.Application
import android.webkit.CookieManager
import com.zyx.academy.util.NetworkMonitor

class ZyxApp : Application() {

    lateinit var networkMonitor: NetworkMonitor
        private set

    override fun onCreate() {
        super.onCreate()
        networkMonitor = NetworkMonitor(this)
        networkMonitor.start()

        // Better Auth session lives in cookies; make sure they persist
        CookieManager.getInstance().setAcceptCookie(true)
    }
}
