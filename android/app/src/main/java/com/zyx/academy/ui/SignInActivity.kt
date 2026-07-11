package com.zyx.academy.ui

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.lifecycle.lifecycleScope
import com.google.android.material.snackbar.Snackbar
import com.zyx.academy.R
import com.zyx.academy.auth.AuthManager
import com.zyx.academy.databinding.ActivitySignInBinding
import kotlinx.coroutines.launch
import java.io.IOException

class SignInActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "ZyxAuth"
    }

    private lateinit var binding: ActivitySignInBinding
    private lateinit var authManager: AuthManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySignInBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Edge-to-edge (targetSdk 35): pad content away from status/nav bars
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(binding.root) { v, insets ->
            val bars = insets.getInsets(
                androidx.core.view.WindowInsetsCompat.Type.systemBars()
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        authManager = AuthManager(applicationContext)
        binding.googleButton.setOnClickListener { signIn() }
    }

    private fun signIn() {
        setLoading(true)
        lifecycleScope.launch {
            try {
                val idToken = authManager.getGoogleIdToken(this@SignInActivity)
                Log.d(TAG, "Got Google ID token, exchanging at " + com.zyx.academy.BuildConfig.BASE_URL)
                val ok = authManager.exchangeIdToken(idToken)
                if (ok) {
                    startActivity(WebViewActivity.intent(this@SignInActivity, "/dashboard"))
                    finish()
                } else {
                    // Server rejected the token: usually audience mismatch, i.e.
                    // GOOGLE_WEB_CLIENT_ID differs from the backend's GOOGLE_CLIENT_ID
                    Log.e(TAG, "Token exchange rejected by backend")
                    showError(R.string.sign_in_error_generic)
                }
            } catch (e: GetCredentialCancellationException) {
                // User dismissed the account picker; not an error
            } catch (e: GetCredentialException) {
                // type reveals the real cause: NoCredentialException = no Google
                // account or no Android OAuth client registered for this SHA-1
                Log.e(TAG, "Credential Manager failed: type=" + e.type, e)
                showError(R.string.sign_in_error_generic)
            } catch (e: IOException) {
                Log.e(TAG, "Network failure during token exchange", e)
                showError(R.string.sign_in_error_network)
            } catch (e: Exception) {
                Log.e(TAG, "Unexpected sign-in failure", e)
                showError(R.string.sign_in_error_generic)
            } finally {
                setLoading(false)
            }
        }
    }

    private fun setLoading(loading: Boolean) {
        binding.googleButton.isEnabled = !loading
        binding.googleButton.setText(
            if (loading) R.string.sign_in_connecting else R.string.sign_in_google
        )
        binding.progress.visibility = if (loading) View.VISIBLE else View.GONE
    }

    private fun showError(messageRes: Int) {
        Snackbar.make(binding.root, messageRes, Snackbar.LENGTH_LONG).show()
    }
}
