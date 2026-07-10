plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    // TODO: add com.google.gms.google-services after dropping google-services.json in app/ (native FCM, Phase 5)
}

android {
    namespace = "com.zyx.academy"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.zyx.academy"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        // Production origin. Must be the www host: the apex 301-redirects to www,
        // and OkHttp replays a redirected POST as GET, which breaks the token exchange.
        buildConfigField("String", "BASE_URL", "\"https://www.zyxacademy.com\"")
        // MUST be the backend's GOOGLE_CLIENT_ID (server verifies token audience against it).
        // A client ID from a different GCP project will always be rejected.
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"328240364978-lpb5qtq25uo8avbsjkptdapibon1gee6.apps.googleusercontent.com\"")
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("androidx.recyclerview:recyclerview:1.4.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.browser:browser:1.8.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Native Google sign-in (Credential Manager)
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    // TODO Phase 5: implementation(platform("com.google.firebase:firebase-bom:33.7.0")); firebase-messaging
}
