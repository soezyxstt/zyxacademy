package com.zyx.academy;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ZyxOfflineStorePluginTest {
    @Test
    public void metadataAndReadingsShareOneTotalByteLimit() {
        long mib = 1024L * 1024L;
        long[][] cases = {{8 * mib, 2 * mib, 6 * mib}, {100 * mib, 8 * mib, 92 * mib}, {1024 * mib, 8 * mib, 1016 * mib}};
        for (long[] values : cases) {
            assertEquals(values[1], ZyxOfflineStorePlugin.metadataBudget(values[0]));
            assertEquals(values[2], ZyxOfflineStorePlugin.readingBudget(values[0]));
            assertEquals(values[0], ZyxOfflineStorePlugin.metadataBudget(values[0]) + ZyxOfflineStorePlugin.readingBudget(values[0]));
        }
    }
    @Test
    public void transportAllowsOnlyFixedOfflineApiRoutes() {
        assertTrue(ZyxOfflineStorePlugin.isAllowedOfflinePath("POST", "/api/offline/sync"));
        assertTrue(ZyxOfflineStorePlugin.isAllowedOfflinePath("GET", "/api/offline/resource?kind=article&id=a"));
        assertTrue(ZyxOfflineStorePlugin.isAllowedOfflinePath("GET", "/api/offline/asset?asset=https%3A%2F%2Fcdn.example%2Fa.png"));
        assertTrue(ZyxOfflineStorePlugin.isAllowedOfflinePath("GET", "/api/offline/manifest?courseId=math"));
    }

    @Test
    public void transportRejectsUntrustedRoutesMethodsAndHeaderInjection() {
        for (String path : new String[]{
            "https://evil.example/api/offline/resource", "//evil.example/api/offline/resource",
            "/api/auth/session", "/api/offline/../auth", "/api/offline/resource#fragment",
            "/api/offline/resource\r\nCookie:secret", "/api/offline\\resource", "api/offline/resource"
        }) assertFalse(path, ZyxOfflineStorePlugin.isAllowedOfflinePath("GET", path));
        assertFalse(ZyxOfflineStorePlugin.isAllowedOfflinePath("POST", "/api/offline/resource"));
        assertFalse(ZyxOfflineStorePlugin.isAllowedOfflinePath("DELETE", "/api/offline/sync"));
        assertFalse(ZyxOfflineStorePlugin.isAllowedOfflinePath("GET", null));
    }
}
