# APK v3 signer lineage and signature parsing inspect ASN.1 fields by reflection.
-keepclassmembers,allowoptimization class * {
    @com.android.apksig.internal.asn1.Asn1Field <fields>;
}
-keepattributes RuntimeVisibleAnnotations
