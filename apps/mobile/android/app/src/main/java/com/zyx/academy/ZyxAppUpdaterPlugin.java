package com.zyx.academy;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "ZyxAppUpdater")
public class ZyxAppUpdaterPlugin extends Plugin {
    private static final int MAX_REDIRECTS = 5;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    static boolean isAllowedDownloadUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isEmpty()) return false;
        String lowerRaw = rawUrl.toLowerCase(Locale.ROOT);
        if (
            lowerRaw.contains("..")
                || lowerRaw.contains("%2e")
                || lowerRaw.contains("%2f")
                || lowerRaw.contains("%5c")
                || lowerRaw.contains("\\")
                || lowerRaw.contains("?")
                || lowerRaw.contains("#")
        ) {
            return false;
        }
        try {
            URI uri = new URI(rawUrl);
            if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
            if (!"github.com".equalsIgnoreCase(uri.getHost())) return false;
            if (uri.getPort() != -1) return false;
            if (uri.getUserInfo() != null) return false;
            if (uri.getRawQuery() != null || uri.getRawFragment() != null) return false;

            String rawPath = uri.getRawPath();
            if (rawPath == null || !rawPath.startsWith("/")) return false;
            String[] segments = rawPath.substring(1).split("/", -1);
            // Exact 6 segments: soezyxstt / zyxacademy / releases / download / <tag> / <asset.apk>
            if (segments.length != 6) return false;
            if (
                !"soezyxstt".equals(segments[0])
                    || !"zyxacademy".equals(segments[1])
                    || !"releases".equals(segments[2])
                    || !"download".equals(segments[3])
            ) {
                return false;
            }
            String tag = segments[4];
            String asset = segments[5];
            if (tag.isEmpty() || asset.isEmpty() || tag.equals(".") || asset.equals(".")) {
                return false;
            }
            return asset.toLowerCase(Locale.ROOT).endsWith(".apk");
        } catch (Exception ex) {
            return false;
        }
    }

    static boolean isAllowedRedirectHost(String host) {
        if (host == null) return false;
        String lower = host.toLowerCase(Locale.ROOT);
        return lower.equals("github.com")
            || lower.equals("objects.githubusercontent.com")
            || lower.equals("release-assets.githubusercontent.com");
    }

    @PluginMethod
    public void getAppCapabilities(PluginCall call) {
        Context context = getContext();
        int googleAppId = context
            .getResources()
            .getIdentifier("google_app_id", "string", context.getPackageName());
        JSObject result = new JSObject();
        result.put("fcmConfigured", googleAppId != 0);
        call.resolve(result);
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("url", "");
        if (!isAllowedDownloadUrl(downloadUrl)) {
            call.reject("Invalid update URL");
            return;
        }

        Context context = getContext();
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !context.getPackageManager().canRequestPackageInstalls()
        ) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + context.getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            call.reject("INSTALL_PERMISSION_REQUIRED");
            return;
        }

        executor.execute(() -> {
            try {
                File updatesDir = new File(context.getCacheDir(), "updates");
                if (!updatesDir.exists() && !updatesDir.mkdirs()) {
                    call.reject("Failed to prepare update cache directory");
                    return;
                }
                File apkFile = new File(updatesDir, "zyx-update.apk");
                downloadWithValidatedRedirects(downloadUrl, apkFile);

                Uri apkUri = FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    apkFile
                );
                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(installIntent);

                JSObject result = new JSObject();
                result.put("started", true);
                call.resolve(result);
            } catch (Exception ex) {
                call.reject("Update download failed: " + ex.getMessage());
            }
        });
    }

    private void downloadWithValidatedRedirects(String initialUrl, File targetFile) throws IOException {
        String currentUrl = initialUrl;
        HttpURLConnection conn = null;

        for (int redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
            URL parsed = new URL(currentUrl);
            if (!"https".equalsIgnoreCase(parsed.getProtocol()) || !isAllowedRedirectHost(parsed.getHost())) {
                throw new IOException("Disallowed update host");
            }
            conn = (HttpURLConnection) parsed.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("User-Agent", "ZyxAcademyUpdater/1.0");

            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM
                || code == HttpURLConnection.HTTP_MOVED_TEMP
                || code == HttpURLConnection.HTTP_SEE_OTHER
                || code == 307
                || code == 308) {
                String nextLocation = conn.getHeaderField("Location");
                conn.disconnect();
                if (nextLocation == null || nextLocation.isEmpty()) {
                    throw new IOException("Empty redirect location");
                }
                currentUrl = new URL(parsed, nextLocation).toString();
                continue;
            }

            if (code != HttpURLConnection.HTTP_OK) {
                conn.disconnect();
                throw new IOException("HTTP " + code);
            }

            long totalLength = conn.getContentLengthLong();
            long downloaded = 0;
            int lastPercent = -1;

            try (
                InputStream in = new BufferedInputStream(conn.getInputStream());
                FileOutputStream out = new FileOutputStream(targetFile)
            ) {
                byte[] buffer = new byte[16384];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    downloaded += read;
                    if (totalLength > 0) {
                        int percent = (int) Math.min(100, (downloaded * 100) / totalLength);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject progress = new JSObject();
                            progress.put("percent", percent);
                            notifyListeners("downloadProgress", progress);
                        }
                    }
                }
                out.flush();
            } finally {
                conn.disconnect();
            }
            return;
        }

        throw new IOException("Too many redirects");
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
