package com.zyx.academy.google

import android.content.Context
import android.content.MutableContextWrapper
import android.content.pm.PackageManager
import android.os.Build
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest
import java.util.Locale

class AndroidGoogleModule : Module() {
  private data class Pick(val cancellation: CancellationSignal, val promise: Promise)
  private var pending: Pick? = null

  override fun definition() = ModuleDefinition {
    Name("ZyxAndroidGoogle")

    Function("isConfigured") {
      appContext.reactContext?.let(::clientId) != null
    }

    AsyncFunction("pick") { audience: String, nonce: String, promise: Promise ->
      select(audience, nonce, promise)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancel") { cancel() }.runOnQueue(Queues.MAIN)
    AsyncFunction("clearCredentialState") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null || clientId(context) == null) {
        promise.resolve(false)
      } else {
        try {
          CredentialManager.create(context).clearCredentialStateAsync(
            ClearCredentialStateRequest(), null, ContextCompat.getMainExecutor(context),
            object : CredentialManagerCallback<Void?, ClearCredentialException> {
              override fun onResult(result: Void?) { promise.resolve(true) }
              override fun onError(error: ClearCredentialException) { promise.resolve(false) }
            }
          )
        } catch (_: Exception) {
          promise.resolve(false)
        }
      }
    }.runOnQueue(Queues.MAIN)
    OnDestroy { Handler(Looper.getMainLooper()).post { cancel() } }
  }

  private fun select(audience: String, nonce: String, promise: Promise) {
    val activity = appContext.currentActivity
    val context = appContext.reactContext
    if (pending != null) {
      promise.resolve(mapOf("status" to "busy"))
      return
    }
    if (activity == null || activity.isFinishing || activity.isDestroyed) {
      promise.resolve(mapOf("status" to "cancelled"))
      return
    }
    if (context == null || clientId(context) != audience || !nonce.matches(Regex("[A-Za-z0-9_-]{43}"))) {
      promise.resolve(mapOf("status" to "unavailable"))
      return
    }

    val pick = Pick(CancellationSignal(), promise)
    pending = pick
    try {
      val option = GetSignInWithGoogleOption.Builder(audience).setNonce(nonce).build()
      val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
      CredentialManager.create(context).getCredentialAsync(
        MutableContextWrapper(activity), request, pick.cancellation, ContextCompat.getMainExecutor(context),
        object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
          override fun onResult(result: GetCredentialResponse) {
            val credential = result.credential
            val token = runCatching {
              if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL)
                GoogleIdTokenCredential.createFrom(credential.data).idToken
              else null
            }.getOrNull()
            if (token.isNullOrBlank() || token.length > 12_000) settle(pick, "unavailable")
            else settle(pick, "selected", token)
          }

          override fun onError(error: GetCredentialException) {
            val status = when (error) {
              is GetCredentialCancellationException -> if (userCancelled(error.errorMessage)) "cancelled" else "unavailable"
              is NoCredentialException,
              is GetCredentialUnsupportedException,
              is GetCredentialProviderConfigurationException -> "unavailable"
              else -> "unavailable"
            }
            settle(pick, status)
          }
        }
      )
    } catch (_: Exception) {
      settle(pick, "unavailable")
    }
  }

  private fun settle(pick: Pick, status: String, token: String? = null) {
    if (pending !== pick) return
    pending = null
    if (token == null) pick.promise.resolve(mapOf("status" to status))
    else pick.promise.resolve(mapOf("status" to status, "idToken" to token))
  }

  private fun cancel() {
    val pick = pending ?: return
    settle(pick, "cancelled")
    pick.cancellation.cancel()
  }

  private fun userCancelled(message: CharSequence?): Boolean {
    val normalized = message?.toString()?.trim()?.lowercase(Locale.ROOT).orEmpty()
    // Play Services can put configuration/reauthentication errors in a cancellation exception.
    val providerError = listOf("reauth", "developer", "28444", "[16]", "[10]", "console", "failed", "error")
    return normalized.isEmpty() || ("cancel" in normalized && providerError.none { it in normalized })
  }

  @Suppress("DEPRECATION")
  private fun clientId(context: Context): String? = runCatching {
    val name = context.packageName
    if (name != "com.zyx.academy.nativeparity") return null
    val manager = context.packageManager
    val metadata = manager.getApplicationInfo(name, PackageManager.GET_META_DATA).metaData ?: return null
    val audience = metadata.getString("$name.STAGING_GOOGLE_OAUTH_CLIENT") ?: return null
    val configured = metadata.getString("$name.STAGING_GOOGLE_OAUTH_SIGNERS")?.split(",")?.toSet() ?: return null
    val current = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      manager.getPackageInfo(name, PackageManager.GET_SIGNING_CERTIFICATES).signingInfo?.apkContentsSigners
    } else {
      manager.getPackageInfo(name, PackageManager.GET_SIGNATURES).signatures
    }
    if (current.isNullOrEmpty() || current.any { signature ->
        val digest = MessageDigest.getInstance("SHA-1").digest(signature.toByteArray())
        digest.joinToString("") { byte -> "%02x".format(Locale.ROOT, byte.toInt() and 0xff) } !in configured
      }) null else audience
  }.getOrNull()
}
