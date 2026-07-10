# JS bridge methods must survive minification
-keepclassmembers class com.zyx.academy.bridge.ZyxBridge {
    @android.webkit.JavascriptInterface <methods>;
}
