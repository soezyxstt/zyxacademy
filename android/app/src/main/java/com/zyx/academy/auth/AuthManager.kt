package com.zyx.academy.auth

import android.content.Context
import android.webkit.CookieManager
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.zyx.academy.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Auth strategy per docs/android-webview-migration.md Phase 3:
 * Google OAuth cannot run inside a WebView (disallowed_useragent), so:
 * 1. Credential Manager fetches a Google ID token natively.
 * 2. Token is exchanged at Better Auth's /api/auth/sign-in/social endpoint.
 * 3. The Set-Cookie session cookie is copied into the WebView CookieManager.
 */
class AuthManager(private val appContext: Context) {

    private val http = OkHttpClient()
    private val json = "application/json; charset=utf-8".toMediaType()

    /** Step 1: native Google sign-in; returns the ID token. Throws on cancel/failure. */
    suspend fun getGoogleIdToken(activityContext: Context): String {
        // Button-triggered flow: always shows the account picker, unlike
        // GetGoogleIdOption which is meant for silent/bottom-sheet sign-in
        // and throws NoCredentialException much more aggressively.
        val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()

        val result = CredentialManager.create(activityContext)
            .getCredential(activityContext, request)

        val credential = GoogleIdTokenCredential.createFrom(result.credential.data)
        return credential.idToken
    }

    /** Step 2 + 3: exchange ID token for a Better Auth session cookie in the WebView store. */
    suspend fun exchangeIdToken(idToken: String): Boolean = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("provider", "google")
            .put("idToken", JSONObject().put("token", idToken))
            .toString()
            .toRequestBody(json)

        val request = Request.Builder()
            .url("${BuildConfig.BASE_URL}/api/auth/sign-in/social")
            .post(body)
            .build()

        http.newCall(request).execute().use { res ->
            if (!res.isSuccessful) {
                android.util.Log.e(
                    "ZyxAuth",
                    "Exchange failed: HTTP " + res.code + " " + (res.body?.string() ?: "")
                )
                return@withContext false
            }
            val cookieManager = CookieManager.getInstance()
            res.headers("Set-Cookie").forEach { cookie ->
                cookieManager.setCookie(BuildConfig.BASE_URL, cookie)
            }
            cookieManager.flush()
            true
        }
    }

    /** Session probe used by the splash gate; mirrors proxy.ts server-side check. */
    suspend fun hasValidSession(): Boolean = withContext(Dispatchers.IO) {
        val cookies = CookieManager.getInstance().getCookie(BuildConfig.BASE_URL)
            ?: return@withContext false

        val request = Request.Builder()
            .url("${BuildConfig.BASE_URL}/api/auth/get-session")
            .header("Cookie", cookies)
            .get()
            .build()

        runCatching {
            http.newCall(request).execute().use { res ->
                if (!res.isSuccessful) return@runCatching false
                val text = res.body?.string() ?: return@runCatching false
                text.contains("\"user\"")
            }
        }.getOrDefault(false)
    }

    suspend fun signOut() = withContext(Dispatchers.IO) {
        val cookies = CookieManager.getInstance().getCookie(BuildConfig.BASE_URL)
        if (cookies != null) {
            val request = Request.Builder()
                .url("${BuildConfig.BASE_URL}/api/auth/sign-out")
                .header("Cookie", cookies)
                .post(ByteArray(0).toRequestBody(null))
                .build()
            runCatching { http.newCall(request).execute().close() }
        }
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
    }
}
