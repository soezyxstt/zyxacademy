package com.zyx.academy;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "ZyxOfflineStore")
public class ZyxOfflineStorePlugin extends Plugin {
    private static final int MAX_ENTRIES = 25;
    private static final long MAX_TOTAL_BYTES = 8L * 1024L * 1024L;
    private static final int MAX_SINGLE_BYTES = 2 * 1024 * 1024;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

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
        byte[] data = new byte[(int) file.length()];
        try (FileInputStream in = new FileInputStream(file)) {
            int offset = 0;
            while (offset < data.length) {
                int read = in.read(data, offset, data.length - offset);
                if (read < 0) break;
                offset += read;
            }
        }
        return new String(data, StandardCharsets.UTF_8);
    }

    private static void writeFileUtf8(File file, String content) throws IOException {
        File tmp = new File(file.getParentFile(), file.getName() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
        if (file.exists()) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
        if (!tmp.renameTo(file)) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            throw new IOException("Failed to persist offline reading");
        }
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
        File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
        if (files == null) return entries;
        for (File f : files) {
            if (!f.isFile() || f.length() > MAX_SINGLE_BYTES) continue;
            try {
                String raw = readFileUtf8(f);
                JSONObject obj = new JSONObject(raw);
                long accessed = obj.optLong("lastAccessedAt", f.lastModified());
                long size = obj.optLong("sizeBytes", f.length());
                entries.add(new EntryMeta(f, accessed, Math.max(size, f.length()), obj));
            } catch (IOException | JSONException ignored) {
                // Skip unreadable/corrupt file
            }
        }
        return entries;
    }

    private void enforceQuota(File dir) {
        List<EntryMeta> entries = loadAllEntries(dir);
        entries.sort(Comparator.comparingLong(e -> e.lastAccessedAt));
        long totalBytes = 0;
        for (EntryMeta entry : entries) {
            totalBytes += entry.sizeBytes;
        }
        int remaining = entries.size();
        for (EntryMeta entry : entries) {
            if (remaining <= MAX_ENTRIES && totalBytes <= MAX_TOTAL_BYTES) break;
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
                File dir = getStoreDir();
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
                writeFileUtf8(target, incoming.toString());
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
        executor.execute(() -> {
            File dir = getStoreDir();
            List<EntryMeta> entries = loadAllEntries(dir);
            entries.sort((a, b) -> Long.compare(b.lastAccessedAt, a.lastAccessedAt));

            JSArray items = new JSArray();
            long totalBytes = 0;
            for (EntryMeta entry : entries) {
                totalBytes += entry.sizeBytes;
                JSObject summary = new JSObject();
                summary.put("key", entry.json.optString("key", ""));
                summary.put("title", entry.json.optString("title", ""));
                summary.put("courseTitle", entry.json.optString("courseTitle", ""));
                summary.put("chapterTitle", entry.json.optString("chapterTitle", ""));
                summary.put("estimatedMinutes", entry.json.optInt("estimatedMinutes", 0));
                summary.put("sizeBytes", entry.sizeBytes);
                summary.put("savedAt", entry.json.optLong("savedAt", 0));
                summary.put("lastAccessedAt", entry.lastAccessedAt);
                items.put(summary);
            }

            JSObject res = new JSObject();
            res.put("items", items);
            res.put("count", entries.size());
            res.put("totalBytes", totalBytes);
            res.put("maxEntries", MAX_ENTRIES);
            res.put("maxBytes", MAX_TOTAL_BYTES);
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
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
