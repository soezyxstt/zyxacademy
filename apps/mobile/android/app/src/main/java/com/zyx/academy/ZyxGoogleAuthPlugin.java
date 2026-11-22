package com.zyx.academy;

import android.app.Activity;
import android.os.CancellationSignal;
import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException;
import androidx.credentials.exceptions.GetCredentialUnsupportedException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.util.concurrent.atomic.AtomicBoolean;

/** Google chooses the device account; the Zyx server validates the returned ID token. */
@CapacitorPlugin(name = "ZyxGoogleAuth")
public class ZyxGoogleAuthPlugin extends Plugin {
    private final AtomicBoolean pending = new AtomicBoolean(false);
    private CancellationSignal pendingCancellation;

    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("serverClientId");
        String nonce = call.getString("nonce");
        if (clientId == null || clientId.length() > 256 || !clientId.endsWith(".apps.googleusercontent.com")
            || nonce == null || !nonce.matches("[A-Za-z0-9_-]{43}")) {
            call.reject("Invalid sign-in request", "INVALID_REQUEST");
            return;
        }
        if (!pending.compareAndSet(false, true)) {
            call.reject("An account picker is already open", "BUSY");
            return;
        }
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            clearPending();
            call.reject("Account selection cancelled", "CANCELLED");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId)
                    .setNonce(nonce)
                    .build();
                GetCredentialRequest request = new GetCredentialRequest.Builder()
                    .addCredentialOption(option)
                    .build();
                pendingCancellation = new CancellationSignal();
                CredentialManager.create(getContext()).getCredentialAsync(
                    activity, request, pendingCancellation, ContextCompat.getMainExecutor(getContext()),
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override
                        public void onResult(GetCredentialResponse response) {
                            clearPending();
                            Credential credential = response.getCredential();
                            if (!(credential instanceof CustomCredential)
                                || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                                call.reject("Google returned an unsupported credential", "NATIVE_GOOGLE_FAILED");
                                return;
                            }
                            try {
                                GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
                                JSObject result = new JSObject();
                                result.put("idToken", google.getIdToken());
                                call.resolve(result);
                            } catch (Exception ignored) {
                                call.reject("Google returned an invalid credential", "NATIVE_GOOGLE_FAILED");
                            }
                        }

                        @Override
                        public void onError(GetCredentialException error) {
                            clearPending();
                            if (error instanceof GetCredentialCancellationException) {
                                call.reject("Account selection cancelled", "CANCELLED");
                            } else if (error instanceof GetCredentialUnsupportedException
                                || error instanceof GetCredentialProviderConfigurationException) {
                                call.reject("Native Google sign-in is unavailable", "UNAVAILABLE");
                            } else {
                                // Provider messages can contain account details. Keep them out of JS and logs.
                                call.reject("Google sign-in could not finish", "NATIVE_GOOGLE_FAILED");
                            }
                        }
                    }
                );
            } catch (Exception ignored) {
                clearPending();
                call.reject("Google sign-in could not start", "NATIVE_GOOGLE_FAILED");
            }
        });
    }

    @PluginMethod
    public void clearCredentialState(PluginCall call) {
        try {
            CredentialManager.create(getContext()).clearCredentialStateAsync(
                new ClearCredentialStateRequest(), null, ContextCompat.getMainExecutor(getContext()),
                new CredentialManagerCallback<Void, ClearCredentialException>() {
                    @Override
                    public void onResult(Void unused) {
                        call.resolve();
                    }

                    @Override
                    public void onError(ClearCredentialException error) {
                        call.reject("Could not clear credential preference", "NATIVE_GOOGLE_FAILED");
                    }
                }
            );
        } catch (Exception ignored) {
            call.reject("Could not clear credential preference", "NATIVE_GOOGLE_FAILED");
        }
    }

    private void clearPending() {
        pendingCancellation = null;
        pending.set(false);
    }

    @Override
    protected void handleOnDestroy() {
        if (pendingCancellation != null) pendingCancellation.cancel();
        clearPending();
        super.handleOnDestroy();
    }
}
