package com.zyx.academy;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ZyxGoogleAuthPluginTest {
    @Test
    public void treatsBlankOrUserCancelMessagesAsCancellation() {
        assertTrue(ZyxGoogleAuthPlugin.isUserCancellationMessage(null));
        assertTrue(ZyxGoogleAuthPlugin.isUserCancellationMessage(""));
        assertTrue(ZyxGoogleAuthPlugin.isUserCancellationMessage("activity is cancelled by the user."));
        assertTrue(ZyxGoogleAuthPlugin.isUserCancellationMessage("User canceled the operation"));
    }

    @Test
    public void treatsPlayServicesReauthAndDeveloperErrorsAsFailures() {
        assertFalse(ZyxGoogleAuthPlugin.isUserCancellationMessage("[16] Account reauth failed."));
        assertFalse(ZyxGoogleAuthPlugin.isUserCancellationMessage("10: [28444] Developer console is not set up correctly."));
        assertFalse(ZyxGoogleAuthPlugin.isUserCancellationMessage("DEVELOPER_ERROR"));
        assertFalse(ZyxGoogleAuthPlugin.isUserCancellationMessage("Unknown internal error"));
    }
}
