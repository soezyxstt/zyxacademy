package com.zyx.academy.updater

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import androidx.core.content.FileProvider
import com.android.apksig.ApkVerifier
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

class AndroidUpdaterModule : Module() {
  private class Download {
    @Volatile var cancelled = false
    @Volatile var connection: HttpURLConnection? = null
    fun cancel() {
      cancelled = true
      connection?.disconnect()
    }
  }

  private val active = AtomicReference<Download>()
  private val executor = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("ZyxAndroidUpdater")
    Events("onUpdateProgress")

    Function("getInstalled") {
      val context = appContext.reactContext
      if (context?.packageName == PACKAGE_NAME) runCatching {
        val info = installed(context)
        mapOf("packageName" to info.packageName, "version" to info.versionName, "versionCode" to versionCode(info))
      }.getOrNull() else null
    }

    AsyncFunction("openInstallSettings") {
      val activity = appContext.currentActivity
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity?.packageName != PACKAGE_NAME || activity.isFinishing) {
        false
      } else {
        runCatching {
          activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + PACKAGE_NAME)))
          true
        }.getOrDefault(false)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("downloadAndInstall") { url: String, version: String, code: Int, bytes: Int, sha: String, promise: Promise ->
      start(url, version, code, bytes.toLong(), sha, promise)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancel") { active.get()?.cancel(); Unit }
    OnDestroy {
      active.get()?.cancel()
      executor.shutdownNow()
    }
  }

  private fun start(url: String, version: String, code: Int, bytes: Long, sha: String, promise: Promise) {
    val context = appContext.reactContext
    if (context?.packageName != PACKAGE_NAME || !validRelease(url, version, code)
      || bytes !in 1..MAX_BYTES || !sha.matches(DIGEST)) {
      promise.resolve("invalid")
      return
    }
    val current = runCatching { installed(context) }.getOrNull()
    if (current == null || code.toLong() <= versionCode(current)) {
      promise.resolve("invalid")
      return
    }
    if (!mayInstall(context)) {
      promise.resolve("permission-required")
      return
    }
    val download = Download()
    if (!active.compareAndSet(null, download)) {
      promise.resolve("busy")
      return
    }
    executor.execute {
      var pendingFile: File? = null
      try {
        val directory = File(context.cacheDir, "verified-apk")
        if (!directory.isDirectory && !directory.mkdirs()) throw IOException()
        directory.listFiles { file -> file.name.startsWith("pending-") }?.forEach { it.delete() }
        val candidate = File.createTempFile("pending-", ".apk", directory)
        pendingFile = candidate
        val result = downloadBytes(download, url, candidate, bytes)
        if (result != sha || !verifyArchive(context, current, candidate, version, code)) throw InvalidArchive()
        val file = File(directory, "update-$code.apk")
        if (file.exists() && !file.delete()) throw IOException()
        if (!candidate.renameTo(file)) throw IOException()
        directory.listFiles { item -> item != file && item.name.startsWith("update-") }?.forEach { it.delete() }
        main.post { finish(context, download, file, promise) }
      } catch (error: Exception) {
        val status = when {
          download.cancelled -> "cancelled"
          error is InvalidArchive -> "invalid"
          else -> "failed"
        }
        main.post { complete(download, promise, status) }
      } finally {
        pendingFile?.delete()
      }
    }
  }

  private fun finish(context: Context, download: Download, file: File, promise: Promise) {
    val activity = appContext.currentActivity
    if (download.cancelled || activity == null || activity.isFinishing || activity.isDestroyed || !activity.hasWindowFocus()) {
      file.delete()
      complete(download, promise, "cancelled")
      return
    }
    if (!mayInstall(context)) {
      file.delete()
      complete(download, promise, "permission-required")
      return
    }
    val opened = runCatching {
      val uri = FileProvider.getUriForFile(context, PACKAGE_NAME + ".zyx.apk", file)
      val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      val installer = context.packageManager.resolveActivity(intent, PackageManager.MATCH_SYSTEM_ONLY or PackageManager.MATCH_DEFAULT_ONLY)
        ?.activityInfo ?: throw IOException()
      activity.startActivity(intent.setClassName(installer.packageName, installer.name))
    }.isSuccess
    if (!opened) file.delete()
    complete(download, promise, if (opened) "confirmation-opened" else "failed")
  }

  private fun complete(download: Download, promise: Promise, status: String) {
    if (active.compareAndSet(download, null)) promise.resolve(status)
  }

  private fun downloadBytes(download: Download, initialUrl: String, file: File, expected: Long): String {
    var uri = URI(initialUrl)
    val deadline = SystemClock.elapsedRealtime() + 5 * 60_000
    for (redirects in 0..5) {
      assertActive(download, deadline)
      if (!trustedUri(uri)) throw IOException()
      val connection = uri.toURL().openConnection() as HttpURLConnection
      download.connection = connection
      try {
        assertActive(download, deadline)
        connection.instanceFollowRedirects = false
        connection.connectTimeout = 15_000
        connection.readTimeout = 20_000
        connection.setRequestProperty("Accept-Encoding", "identity")
        connection.setRequestProperty("User-Agent", "ZyxAcademyExpoUpdater/1.0")
        connection.setRequestProperty("Cookie", "")
        val status = connection.responseCode
        if (status in REDIRECTS) {
          val location = connection.getHeaderField("Location") ?: throw IOException()
          uri = uri.resolve(location)
          continue
        }
        if (status != HttpURLConnection.HTTP_OK) throw IOException()
        val length = connection.contentLengthLong
        if (length >= 0 && length != expected) throw InvalidArchive()
        val digest = MessageDigest.getInstance("SHA-256")
        var received = 0L
        var progress = -1
        connection.inputStream.buffered().use { input ->
          file.outputStream().buffered().use { output ->
            val buffer = ByteArray(32 * 1024)
            while (true) {
              assertActive(download, deadline)
              val count = input.read(buffer)
              if (count == -1) break
              received += count
              if (received > expected) throw InvalidArchive()
              output.write(buffer, 0, count)
              digest.update(buffer, 0, count)
              val percent = (100 * received / expected).toInt()
              if (percent != progress) {
                progress = percent
                main.post {
                  if (active.get() === download && !download.cancelled) sendEvent("onUpdateProgress", mapOf("percent" to percent))
                }
              }
            }
          }
        }
        assertActive(download, deadline)
        if (received != expected) throw InvalidArchive()
        return hex(digest.digest())
      } finally {
        download.connection = null
        connection.disconnect()
      }
    }
    throw IOException()
  }

  @Suppress("DEPRECATION")
  private fun verifyArchive(context: Context, current: PackageInfo, candidate: File, version: String, code: Int): Boolean {
    val archive = context.packageManager.getPackageArchiveInfo(candidate.path, 0) ?: return false
    if (archive.packageName != PACKAGE_NAME || archive.versionName != version || versionCode(archive) != code.toLong()
      || code.toLong() <= versionCode(current)) return false
    val installedSigners = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) current.signingInfo?.apkContentsSigners else current.signatures
    val expected = installedSigners?.map { fingerprint(it.toByteArray()) }?.toSet().orEmpty()
    if (expected.isEmpty()) return false
    val result = runCatching {
      ApkVerifier.Builder(candidate).setMinCheckedPlatformVersion(Build.VERSION.SDK_INT)
        .setMaxCheckedPlatformVersion(Build.VERSION.SDK_INT).build().verify()
    }.getOrNull() ?: return false
    return result.isVerified && result.signerCertificates.map { fingerprint(it.encoded) }.toSet() == expected
  }

  @Suppress("DEPRECATION")
  private fun installed(context: Context): PackageInfo = context.packageManager.getPackageInfo(
    PACKAGE_NAME, if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
  )

  @Suppress("DEPRECATION")
  private fun versionCode(info: PackageInfo): Long =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()

  private fun mayInstall(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

  private fun assertActive(download: Download, deadline: Long) {
    if (download.cancelled || SystemClock.elapsedRealtime() > deadline) throw IOException()
  }

  private class InvalidArchive : IOException()

  private companion object {
    const val PACKAGE_NAME = "com.zyx.academy.nativeparity"
    const val MAX_BYTES = 256L * 1024 * 1024
    const val REPOSITORY = "https://github.com/soezyxstt/zyxacademy/releases/download/"
    val VERSION = Regex("[0-9]{1,5}\\.[0-9]{1,5}\\.[0-9]{1,5}(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?")
    val DIGEST = Regex("[a-f0-9]{64}")
    val REDIRECTS = setOf(301, 302, 303, 307, 308)
    val ASSET_HOSTS = setOf("objects.githubusercontent.com", "release-assets.githubusercontent.com")

    fun validRelease(url: String, version: String, code: Int): Boolean =
      version.length <= 60 && version.matches(VERSION) && code in 1..2_100_000_000 &&
        url == "${REPOSITORY}expo-android-v$version-b$code/zyx-academy-expo-android-$version-b$code.apk"

    fun trustedUri(uri: URI): Boolean {
      if (uri.scheme != "https" || uri.rawUserInfo != null || uri.port != -1 || uri.rawFragment != null) return false
      if (uri.host == "github.com") {
        return uri.rawQuery == null && uri.toString().startsWith(REPOSITORY) &&
          uri.rawPath.matches(Regex("/soezyxstt/zyxacademy/releases/download/[A-Za-z0-9.-]+/[A-Za-z0-9.-]+\\.apk"))
      }
      return uri.host in ASSET_HOSTS
    }

    fun fingerprint(bytes: ByteArray) = hex(MessageDigest.getInstance("SHA-256").digest(bytes))
    fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }
  }
}
