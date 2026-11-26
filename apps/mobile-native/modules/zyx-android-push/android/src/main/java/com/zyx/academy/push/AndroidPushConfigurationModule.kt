package com.zyx.academy.push

import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AndroidPushConfigurationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZyxAndroidPushConfiguration")

    Function("isConfigured") {
      appContext.reactContext?.let(::hasStagingFcm) == true
    }
  }

  @Suppress("DEPRECATION")
  private fun hasStagingFcm(context: Context): Boolean {
    val packageName = context.packageName
    if (packageName != "com.zyx.academy.nativeparity") return false

    val metadata = context.packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA).metaData
    val expectedApp = metadata?.getString("$packageName.STAGING_FCM") ?: return false
    if (resource(context, "project_id") != "zyx-academy-staging") return false
    if (resource(context, "google_api_key").isNullOrBlank()) return false

    val sender = resource(context, "gcm_defaultSenderId") ?: return false
    val app = resource(context, "google_app_id") ?: return false
    return app == expectedApp && sender.matches(Regex("[0-9]+")) && app.matches(Regex("1:$sender:android:[a-f0-9]+"))
  }

  private fun resource(context: Context, name: String): String? {
    val id = context.resources.getIdentifier(name, "string", context.packageName)
    return if (id == 0) null else context.getString(id)
  }
}
