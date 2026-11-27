package com.zyx.academy;

import android.util.AtomicFile;
import android.util.Base64;
import android.webkit.CookieManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "ZyxOfflineStore")
public class ZyxOfflineStorePlugin extends Plugin {
    private static final int MAX_ENTRIES = 250;
    private static final long MAX_TOTAL_BYTES = 100L * 1024L * 1024L;
    private static final int MAX_SINGLE_BYTES = 25 * 1024 * 1024;
    private static final String LIBRARY_FILE = "library-v2.json";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final ExecutorService networkExecutor = Executors.newFixedThreadPool(2);
    private final AtomicLong storeGeneration = new AtomicLong();

    static String keyToFileName(String key) {
        if (key == null || key.isEmpty()) return null;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(key.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2 + 5);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            hex.append(".json");
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            return null;
        }
    }

    private File getStoreDir() {
        File dir = new File(getContext().getFilesDir(), "offline-readings");
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    private static String readFileUtf8(File file) throws IOException {
        ByteArrayOutputStream data = new ByteArrayOutputStream();
        try (FileInputStream in = new AtomicFile(file).openRead()) {
            byte[] buffer = new byte[16 * 1024]; int read;
            while ((read = in.read(buffer)) != -1) {
                if (data.size() + read > MAX_SINGLE_BYTES) throw new IOException("Offline file too large");
                data.write(buffer, 0, read);
            }
        }
        return new String(data.toByteArray(), StandardCharsets.UTF_8);
    }

    private static void writeFileUtf8(File file, String content) throws IOException {
        AtomicFile atomic = new AtomicFile(file);
        FileOutputStream out = null;
        try {
            out = atomic.startWrite();
            out.write(content.getBytes(StandardCharsets.UTF_8));
            atomic.finishWrite(out);
        } catch (IOException error) {
            if (out != null) atomic.failWrite(out);
            throw error;
        }
    }

    private String serverOrigin() {
        String fallback = getContext().getPackageName().endsWith(".nightly")
            ? "https://staging.zyxacademy.com" : "https://www.zyxacademy.com";
        String configured = getConfig().getString("serverOrigin", fallback);
        try {
            URI origin = URI.create(configured);
            if ("https".equals(origin.getScheme()) && ("staging.zyxacademy.com".equals(origin.getHost())
                || "www.zyxacademy.com".equals(origin.getHost()) || "zyxacademy.com".equals(origin.getHost()))) {
                return origin.getScheme() + "://" + origin.getHost();
            }
        } catch (IllegalArgumentException ignored) {}
        return fallback;
    }

    private JSONObject readLibrary(File dir) {
        File file = new File(dir, LIBRARY_FILE);
        if (!file.isFile() || file.length() > MAX_SINGLE_BYTES) return null;
        try { return new JSONObject(readFileUtf8(file)); }
        catch (IOException | JSONException ignored) { return null; }
    }

    static boolean isValidLibrary(JSONObject snapshot, String origin, long now) {
        if (snapshot == null || snapshot.optInt("schemaVersion") != 2) return false;
        String user = snapshot.optString("userId", "");
        String locale = snapshot.optString("locale", "");
        String scope = new org.json.JSONArray().put(origin).put(user).put(locale).toString();
        long verified = snapshot.optLong("lastVerifiedAt", 0);
        long lease = snapshot.optLong("accessValidUntil", 0);
        return !user.isEmpty() && ("id".equals(locale) || "en".equals(locale))
            && origin.equals(snapshot.optString("environment")) && scope.equals(snapshot.optString("scopeKey"))
            && verified > 0 && verified <= now + 300_000L && lease > now
            && lease <= verified + 7L * 86_400_000L;
    }

    static long metadataBudget(long maxBytes) { return Math.min(8L * 1024 * 1024, maxBytes / 4); }

    static long readingBudget(long maxBytes) { return Math.max(0, maxBytes - metadataBudget(maxBytes)); }

    static boolean isReadable(JSONObject reading, JSONObject library, String origin, long now) {
        return isValidLibrary(library, origin, now) && reading != null
            && hasCourseAccess(reading, library, now)
            && reading.optInt("schemaVersion") == 2 && reading.optBoolean("assetsComplete", false)
            && !reading.optBoolean("invalidated", false)
            && library.optString("scopeKey").equals(reading.optString("scopeKey"))
            && library.optString("userId").equals(reading.optString("userId"))
            && origin.equals(reading.optString("environment"))
            && library.optString("locale").equals(reading.optString("locale"))
            && !reading.optString("contentVersion", "").isEmpty()
            && reading.optLong("lastVerifiedAt", 0) > 0
            && reading.optLong("lastVerifiedAt", 0) <= now + 300_000L
            && reading.optLong("accessValidUntil", 0) > now
            && reading.optLong("accessValidUntil", 0) <= reading.optLong("lastVerifiedAt", 0) + 7L * 86_400_000L;
    }

    static boolean hasCourseAccess(JSONObject reading, JSONObject library, long now) {
        JSONArray courses = library.optJSONArray("courses");
        if (courses == null) return false;
        for (int i = 0; i < courses.length(); i++) {
            JSONObject course = courses.optJSONObject(i);
            if (course == null || !course.optString("id").equals(reading.optString("courseId"))
                || course.optLong("accessValidUntil", library.optLong("accessValidUntil", 0)) <= now) continue;
            JSONArray allowed = course.optJSONArray("chapterIds");
            if (allowed == null) return true;
            JSONArray chapters = reading.optJSONArray("chapterIds");
            if (chapters == null || chapters.length() == 0) return false;
            for (int chapter = 0; chapter < chapters.length(); chapter++) {
                boolean found = false;
                for (int grant = 0; grant < allowed.length(); grant++) {
                    if (chapters.optString(chapter).equals(allowed.optString(grant))) { found = true; break; }
                }
                if (!found) return false;
            }
            return true;
        }
        return false;
    }

    static JSONObject visibleLibrary(JSONObject snapshot, long now) {
        try {
            JSONArray courses = snapshot.optJSONArray("courses");
            JSONArray visibleCourses = new JSONArray();
            java.util.Set<String> courseIds = new java.util.HashSet<>();
            if (courses != null) for (int i = 0; i < courses.length(); i++) {
                JSONObject course = courses.optJSONObject(i);
                if (course != null && course.optLong("accessValidUntil", snapshot.optLong("accessValidUntil", 0)) > now) {
                    visibleCourses.put(course); courseIds.add(course.optString("id"));
                }
            }
            JSONArray materials = snapshot.optJSONArray("materials");
            JSONArray visibleMaterials = new JSONArray();
            if (materials != null) for (int i = 0; i < materials.length(); i++) {
                JSONObject material = materials.optJSONObject(i);
                if (material != null && courseIds.contains(material.optString("courseId"))
                    && material.optLong("accessValidUntil", snapshot.optLong("accessValidUntil", 0)) > now) visibleMaterials.put(material);
            }
            snapshot.put("courses", visibleCourses); snapshot.put("materials", visibleMaterials);
            return snapshot;
        } catch (JSONException ignored) { return null; }
    }

    @PluginMethod
    public void saveLibrarySnapshot(PluginCall call) {
        String raw = call.getString("payloadJson", "");
        executor.execute(() -> {
            try {
                if (raw.getBytes(StandardCharsets.UTF_8).length > MAX_SINGLE_BYTES) throw new IOException();
                JSONObject snapshot = new JSONObject(raw);
                JSONObject policy = snapshot.optJSONObject("policy");
                long totalBudget = policy == null ? MAX_TOTAL_BYTES : Math.max(8L * 1024 * 1024, Math.min(1024L * 1024 * 1024, policy.optLong("maxBytes", MAX_TOTAL_BYTES)));
                if (raw.getBytes(StandardCharsets.UTF_8).length > metadataBudget(totalBudget)) {
                    call.reject("Offline library exceeds metadata budget"); return;
                }
                if (!isValidLibrary(snapshot, serverOrigin(), System.currentTimeMillis())) {
                    call.reject("Offline library scope or access has expired"); return;
                }
                JSONObject previous = readLibrary(getStoreDir());
                if (previous != null && previous.optString("scopeKey").equals(snapshot.optString("scopeKey"))
                    && previous.optLong("lastVerifiedAt", 0) > snapshot.optLong("lastVerifiedAt", 0)) {
                    call.reject("A newer offline library is already stored"); return;
                }
                if (previous == null || !previous.optString("scopeKey").equals(snapshot.optString("scopeKey"))
                    || !previous.optString("sessionId").equals(snapshot.optString("sessionId"))) storeGeneration.incrementAndGet();
                writeFileUtf8(new File(getStoreDir(), LIBRARY_FILE), raw);
                enforceQuota(getStoreDir());
                JSObject result = new JSObject(); result.put("saved", true); call.resolve(result);
            } catch (IOException | JSONException error) { call.reject("Failed to save offline library"); }
        });
    }

    @PluginMethod
    public void getLibrarySnapshot(PluginCall call) {
        executor.execute(() -> {
            JSONObject snapshot = readLibrary(getStoreDir());
            boolean valid = isValidLibrary(snapshot, serverOrigin(), System.currentTimeMillis());
            JSObject result = new JSObject();
            result.put("snapshot", valid ? visibleLibrary(snapshot, System.currentTimeMillis()) : JSONObject.NULL);
            result.put("expired", snapshot != null && !valid);
            if (snapshot != null) {
                JSObject identity = new JSObject();
                for (String name : new String[]{"userId", "environment", "locale", "scopeKey", "sessionId"}) {
                    identity.put(name, snapshot.optString(name, ""));
                }
                result.put("identity", identity);
            }
            call.resolve(result);
        });
    }

    @PluginMethod
    public void clearLibrarySnapshot(PluginCall call) {
        executor.execute(() -> { clearStore(); call.resolve(); });
    }

    private void clearStore() {
        storeGeneration.incrementAndGet();
        File[] files = getStoreDir().listFiles();
        if (files != null) for (File file : files) if (file.isFile()) new AtomicFile(file).delete();
    }

    static boolean isAllowedOfflinePath(String method, String path) {
        if (path == null || path.contains("\\") || path.contains("\r") || path.contains("\n")) return false;
        try {
            URI uri = URI.create(path);
            if (uri.isAbsolute() || uri.getRawAuthority() != null || uri.getFragment() != null) return false;
            String route = uri.getPath();
            if ("POST".equals(method)) return "/api/offline/sync".equals(route);
            return "GET".equals(method) && ("/api/offline/manifest".equals(route)
                || "/api/offline/resource".equals(route) || "/api/offline/asset".equals(route));
        } catch (IllegalArgumentException ignored) { return false; }
    }

    private static final class RequestBinding {
        final JSONObject snapshot;
        final long generation;
        RequestBinding(JSONObject snapshot, long generation) { this.snapshot = snapshot; this.generation = generation; }
    }

    @PluginMethod
    public void offlineRequest(PluginCall call) {
        String path = call.getString("path", "");
        String method = call.getString("method", "GET");
        String expectedUser = call.getString("expectedAccountId", "");
        String expectedScope = call.getString("expectedScopeKey", "");
        String body = call.getString("body", "");
        String etag = call.getString("etag", "");
        if (!isAllowedOfflinePath(method, path) || expectedUser.isEmpty() || body.length() > 64 * 1024) {
            call.reject("Offline request is not allowed"); return;
        }
        networkExecutor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                RequestBinding binding = executor.submit(() -> new RequestBinding(readLibrary(getStoreDir()), storeGeneration.get())).get();
                long generation = binding.generation;
                JSONObject before = binding.snapshot;
                if (before == null || !expectedScope.equals(before.optString("scopeKey"))
                    || !expectedUser.equals(before.optString("userId"))) {
                    call.reject("Offline account changed"); return;
                }
                String origin = serverOrigin();
                URL url = new URL(origin + path);
                connection = (HttpURLConnection) url.openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(10_000);
                connection.setReadTimeout(20_000);
                connection.setRequestMethod(method);
                connection.setRequestProperty("Accept", "application/json,image/*");
                connection.setRequestProperty("Origin", origin);
                connection.setRequestProperty("Cache-Control", "no-cache");
                connection.setRequestProperty("x-offline-account-id", expectedUser);
                String expectedSession = before.optString("sessionId", "");
                if (!expectedSession.isEmpty()) connection.setRequestProperty("x-offline-session-id", expectedSession);
                String cookie = CookieManager.getInstance().getCookie(origin);
                if (cookie != null) connection.setRequestProperty("Cookie", cookie);
                if (etag.length() < 2048 && !etag.contains("\r") && !etag.contains("\n") && !etag.isEmpty()) {
                    connection.setRequestProperty("If-None-Match", etag);
                }
                if ("POST".equals(method)) {
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/json");
                    try (java.io.OutputStream output = connection.getOutputStream()) {
                        output.write(body.getBytes(StandardCharsets.UTF_8));
                    }
                }
                int status = connection.getResponseCode();
                String responseUser = connection.getHeaderField("x-offline-account-id");
                if (status >= 200 && status < 400 && !expectedUser.equals(responseUser)) status = 403;
                if (status == 401 || status == 403) {
                    executor.execute(() -> {
                        JSONObject active = readLibrary(getStoreDir());
                        if (active != null && generation == storeGeneration.get() && expectedScope.equals(active.optString("scopeKey"))) clearStore();
                    });
                }
                JSObject result = new JSObject(); result.put("status", status);
                JSObject headers = new JSObject();
                for (String name : new String[]{"content-type", "etag", "x-offline-account-id", "x-offline-session-id", "x-offline-environment", "x-offline-locale", "x-offline-lease-expires-at", "x-offline-cursor", "x-offline-revision", "x-offline-validated-at"}) {
                    String value = connection.getHeaderField(name);
                    if (value != null && status != 403 && status != 409) headers.put(name, value);
                }
                result.put("headers", headers);
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                if (status >= 200 && status < 300) {
                    try (InputStream input = connection.getInputStream()) {
                        byte[] buffer = new byte[16 * 1024]; int read;
                        while ((read = input.read(buffer)) != -1) {
                            if (bytes.size() + read > MAX_SINGLE_BYTES) throw new IOException("Offline response too large");
                            bytes.write(buffer, 0, read);
                        }
                    }
                }
                final int responseStatus = status;
                // Resolve on the same queue as account clears and writes, after the whole body arrives.
                executor.execute(() -> {
                    JSONObject active = readLibrary(getStoreDir());
                    if (((responseStatus != 401 && responseStatus != 403) || active != null) && (generation != storeGeneration.get()
                        || active == null || !expectedScope.equals(active.optString("scopeKey"))
                        || !expectedSession.equals(active.optString("sessionId", "")))) {
                        result.put("status", 409); result.put("headers", new JSObject()); result.put("bodyBase64", "");
                    } else result.put("bodyBase64", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
                    call.resolve(result);
                });
            } catch (IOException | java.util.concurrent.ExecutionException error) { call.reject("Offline sync connection failed"); }
            catch (InterruptedException error) { Thread.currentThread().interrupt(); call.reject("Offline sync interrupted"); }
            finally { if (connection != null) connection.disconnect(); }
        });
    }

    private static final class EntryMeta {
        final File file;
        final long lastAccessedAt;
        final long sizeBytes;
        final JSONObject json;

        EntryMeta(File file, long lastAccessedAt, long sizeBytes, JSONObject json) {
            this.file = file;
            this.lastAccessedAt = lastAccessedAt;
            this.sizeBytes = sizeBytes;
            this.json = json;
        }
    }

    private List<EntryMeta> loadAllEntries(File dir) {
        List<EntryMeta> entries = new ArrayList<>();
        File[] files = dir.listFiles((d, name) -> name.endsWith(".json") && !LIBRARY_FILE.equals(name));
        if (files == null) return entries;
        for (File f : files) {
            if (!f.isFile() || f.length() > MAX_SINGLE_BYTES) continue;
            try {
                String raw = readFileUtf8(f);
                JSONObject obj = new JSONObject(raw);
                long accessed = obj.optLong("lastAccessedAt", f.lastModified());
                entries.add(new EntryMeta(f, accessed, f.length(), obj));
            } catch (IOException | JSONException ignored) {
                // Skip unreadable/corrupt file
            }
        }
        return entries;
    }

    private void enforceQuota(File dir) {
        List<EntryMeta> entries = loadAllEntries(dir);
        JSONObject snapshot = readLibrary(dir);
        JSONObject policy = snapshot != null ? snapshot.optJSONObject("policy") : null;
        int maxEntries = policy == null ? MAX_ENTRIES : Math.max(25, Math.min(1000, policy.optInt("maxEntries", MAX_ENTRIES)));
        long maxBytes = policy == null ? MAX_TOTAL_BYTES : Math.max(8L * 1024 * 1024, Math.min(1024L * 1024 * 1024, policy.optLong("maxBytes", MAX_TOTAL_BYTES)));
        maxBytes = readingBudget(maxBytes);
        entries.sort(Comparator.comparingLong(e -> e.lastAccessedAt));
        long totalBytes = 0;
        for (EntryMeta entry : entries) {
            totalBytes += entry.sizeBytes;
        }
        int remaining = entries.size();
        for (EntryMeta entry : entries) {
            if (remaining <= maxEntries && totalBytes <= maxBytes) break;
            if (entry.json.optBoolean("pinned", false)) continue;
            if (entry.file.delete()) {
                remaining -= 1;
                totalBytes -= entry.sizeBytes;
            }
        }
    }

    @PluginMethod
    public void saveReading(PluginCall call) {
        String key = call.getString("key", "");
        String payloadJson = call.getString("payloadJson", "");
        String fileName = keyToFileName(key);
        if (fileName == null || payloadJson == null || payloadJson.isEmpty()) {
            call.reject("Invalid offline reading payload");
            return;
        }
        byte[] utf8 = payloadJson.getBytes(StandardCharsets.UTF_8);
        if (utf8.length > MAX_SINGLE_BYTES) {
            call.reject("Offline reading exceeds size limit");
            return;
        }

        executor.execute(() -> {
            try {
                // Validate JSON structure before saving
                JSONObject incoming = new JSONObject(payloadJson);
                if (!key.equals(incoming.optString("key"))) { call.reject("Offline key mismatch"); return; }
                File dir = getStoreDir();
                JSONObject library = readLibrary(dir);
                if (!isReadable(incoming, library, serverOrigin(), System.currentTimeMillis())) {
                    call.reject("Offline reading scope or access is invalid"); return;
                }
                JSONObject policy = library.optJSONObject("policy");
                long maxBytes = policy == null ? MAX_TOTAL_BYTES : Math.max(8L * 1024 * 1024, Math.min(1024L * 1024 * 1024, policy.optLong("maxBytes", MAX_TOTAL_BYTES)));
                int maxEntries = policy == null ? MAX_ENTRIES : Math.max(25, Math.min(1000, policy.optInt("maxEntries", MAX_ENTRIES)));
                long pinnedBytes = 0; int pinnedCount = 0;
                for (EntryMeta entry : loadAllEntries(dir)) {
                    if (entry.json.optBoolean("pinned", false) && !key.equals(entry.json.optString("key"))) {
                        pinnedBytes += entry.sizeBytes; pinnedCount++;
                    }
                }
                File target = new File(dir, fileName);
                // Preserve newer locally saved readingPosition when re-saving a snapshot
                if (target.isFile() && target.length() <= MAX_SINGLE_BYTES) {
                    try {
                        JSONObject existing = new JSONObject(readFileUtf8(target));
                        JSONObject existingPos = existing.optJSONObject("readingPosition");
                        JSONObject incomingPos = incoming.optJSONObject("readingPosition");
                        if (existingPos != null) {
                            long existingAt = existingPos.optLong("updatedAt", 0L);
                            long incomingAt = incomingPos != null ? incomingPos.optLong("updatedAt", 0L) : 0L;
                            if (existingAt > incomingAt) {
                                incoming.put("readingPosition", existingPos);
                            }
                        }
                    } catch (IOException | JSONException ignored) {
                        // Best-effort position preservation
                    }
                }
                String serialized = incoming.toString();
                int serializedBytes = serialized.getBytes(StandardCharsets.UTF_8).length;
                if (serializedBytes > MAX_SINGLE_BYTES || pinnedBytes + serializedBytes > readingBudget(maxBytes) || pinnedCount + 1 > maxEntries) {
                    call.reject("Offline storage is full"); return;
                }
                writeFileUtf8(target, serialized);
                enforceQuota(dir);
                JSObject res = new JSObject();
                res.put("saved", true);
                call.resolve(res);
            } catch (IOException | JSONException e) {
                call.reject("Failed to save offline reading");
            }
        });
    }

    @PluginMethod
    public void saveReadingPosition(PluginCall call) {
        String key = call.getString("key", "");
        String positionJson = call.getString("positionJson", "");
        String fileName = keyToFileName(key);
        if (fileName == null || positionJson == null || positionJson.isEmpty()) {
            call.resolve();
            return;
        }
        if (positionJson.getBytes(StandardCharsets.UTF_8).length > 8192) {
            call.reject("Reading position payload too large");
            return;
        }

        executor.execute(() -> {
            File target = new File(getStoreDir(), fileName);
            if (!target.isFile() || target.length() > MAX_SINGLE_BYTES) {
                JSObject res = new JSObject();
                res.put("saved", false);
                call.resolve(res);
                return;
            }
            try {
                JSONObject position = new JSONObject(positionJson);
                JSONObject parsed = new JSONObject(readFileUtf8(target));
                JSONObject existingPos = parsed.optJSONObject("readingPosition");
                long existingAt = existingPos != null ? existingPos.optLong("updatedAt", 0L) : 0L;
                long incomingAt = position.optLong("updatedAt", 0L);
                if (existingPos == null || incomingAt >= existingAt) {
                    parsed.put("readingPosition", position);
                    writeFileUtf8(target, parsed.toString());
                }
                JSObject res = new JSObject();
                res.put("saved", true);
                call.resolve(res);
            } catch (IOException | JSONException e) {
                call.reject("Failed to save reading position");
            }
        });
    }

    @PluginMethod
    public void listReadings(PluginCall call) {
        boolean includeExpired = Boolean.TRUE.equals(call.getBoolean("includeExpired", false));
        executor.execute(() -> {
            File dir = getStoreDir();
            List<EntryMeta> entries = loadAllEntries(dir);
            JSONObject library = readLibrary(dir);
            entries.sort((a, b) -> Long.compare(b.lastAccessedAt, a.lastAccessedAt));

            JSArray items = new JSArray();
            long totalBytes = new File(dir, LIBRARY_FILE).length();
            for (EntryMeta entry : entries) totalBytes += entry.sizeBytes;
            for (EntryMeta entry : entries) {
                boolean readable = isReadable(entry.json, library, serverOrigin(), System.currentTimeMillis());
                if (!readable && !(includeExpired && library != null
                    && library.optString("scopeKey").equals(entry.json.optString("scopeKey"))
                    && library.optString("userId").equals(entry.json.optString("userId")))) continue;
                JSObject summary = new JSObject();
                summary.put("key", entry.json.optString("key", ""));
                summary.put("title", readable ? entry.json.optString("title", "") : "");
                summary.put("courseTitle", readable ? entry.json.optString("courseTitle", "") : "");
                summary.put("chapterTitle", readable ? entry.json.optString("chapterTitle", "") : "");
                summary.put("expired", !readable);
                summary.put("estimatedMinutes", entry.json.optInt("estimatedMinutes", 0));
                summary.put("sizeBytes", entry.sizeBytes);
                summary.put("savedAt", entry.json.optLong("savedAt", 0));
                summary.put("lastAccessedAt", entry.lastAccessedAt);
                for (String field : new String[]{"courseId", "materialId", "kind", "resourceKind", "chapterIds", "contentCursor", "userId", "scopeKey", "contentVersion", "lastVerifiedAt", "accessValidUntil", "pinned"}) {
                    summary.put(field, entry.json.opt(field));
                }
                items.put(summary);
            }

            JSObject res = new JSObject();
            res.put("items", items);
            res.put("count", items.length());
            res.put("totalBytes", totalBytes);
            JSONObject policy = library != null ? library.optJSONObject("policy") : null;
            res.put("maxEntries", policy == null ? MAX_ENTRIES : Math.max(25, Math.min(1000, policy.optInt("maxEntries", MAX_ENTRIES))));
            res.put("maxBytes", policy == null ? MAX_TOTAL_BYTES : Math.max(8L * 1024 * 1024, Math.min(1024L * 1024 * 1024, policy.optLong("maxBytes", MAX_TOTAL_BYTES))));
            call.resolve(res);
        });
    }

    @PluginMethod
    public void getReading(PluginCall call) {
        String key = call.getString("key", "");
        String fileName = keyToFileName(key);
        if (fileName == null) {
            call.reject("Invalid key");
            return;
        }

        executor.execute(() -> {
            File target = new File(getStoreDir(), fileName);
            if (!target.isFile()) {
                JSObject empty = new JSObject();
                empty.put("reading", JSONObject.NULL);
                call.resolve(empty);
                return;
            }
            try {
                String raw = readFileUtf8(target);
                JSONObject parsed = new JSONObject(raw);
                if (!isReadable(parsed, readLibrary(getStoreDir()), serverOrigin(), System.currentTimeMillis())) {
                    JSObject empty = new JSObject(); empty.put("reading", JSONObject.NULL); call.resolve(empty); return;
                }
                parsed.put("lastAccessedAt", System.currentTimeMillis());
                try {
                    writeFileUtf8(target, parsed.toString());
                } catch (IOException ignored) {
                    // Updating access timestamp is best-effort
                }
                JSObject res = new JSObject();
                res.put("reading", parsed);
                call.resolve(res);
            } catch (IOException | JSONException e) {
                call.reject("Failed to read offline item");
            }
        });
    }

    @PluginMethod
    public void removeReading(PluginCall call) {
        String key = call.getString("key", "");
        String fileName = keyToFileName(key);
        if (fileName == null) {
            call.resolve();
            return;
        }
        executor.execute(() -> {
            File target = new File(getStoreDir(), fileName);
            if (target.exists()) {
                //noinspection ResultOfMethodCallIgnored
                target.delete();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void clearOtherUsers(PluginCall call) {
        String activeUserId = call.getString("userId", "");
        executor.execute(() -> {
            File dir = getStoreDir();
            List<EntryMeta> entries = loadAllEntries(dir);
            for (EntryMeta entry : entries) {
                String owner = entry.json.optString("userId", "");
                if (activeUserId == null || activeUserId.isEmpty() || !activeUserId.equals(owner)) {
                    //noinspection ResultOfMethodCallIgnored
                    entry.file.delete();
                }
            }
            JSONObject library = readLibrary(dir);
            if (library != null && (activeUserId.isEmpty() || !activeUserId.equals(library.optString("userId")))) {
                storeGeneration.incrementAndGet();
                new AtomicFile(new File(dir, LIBRARY_FILE)).delete();
            }
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        networkExecutor.shutdownNow();
        super.handleOnDestroy();
    }
}
