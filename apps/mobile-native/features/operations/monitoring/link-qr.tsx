import { useLayoutEffect, useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import Svg, { Path, Rect } from "react-native-svg";
import { shortLinkQr } from "./short-link-qr";
import { Body, Control, ReadState, styles, useMonitoringUi } from "./ui";
import { useMonitoringAction } from "./mutation";

export function ShortLinkQr({ url, fileName, label }: { url: string; fileName: string; label: string }) {
  const { t } = useMonitoringUi();
  const svg = useRef<InstanceType<typeof Svg>>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const qr = useMemo(() => {
    try { return shortLinkQr(url); }
    catch { return null; }
  }, [url]);
  const share = useMonitoringAction();

  async function sharePng() {
    const image = svg.current;
    if (!image || !(await Sharing.isAvailableAsync())) throw new Error("QR sharing is unavailable");
    if (!mounted.current) return;
    const png = await new Promise<string>(resolve => image.toDataURL(resolve, { width: 600, height: 600 }));
    if (!mounted.current) return;
    if (!png) throw new Error("QR export failed");

    const file = new File(Paths.cache, `${randomUUID()}-${fileName}`);
    try {
      await file.create();
      await file.write(png, { encoding: "base64" });
      if (mounted.current) {
        await Sharing.shareAsync(file.uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: label });
      }
    } finally {
      if (file.exists) await file.delete();
    }
  }

  if (!qr) return <Body error>{t("Tautan terlalu panjang untuk kode QR.", "The link is too long for a QR code.")}</Body>;

  return <>
    <View style={{ alignSelf: "center", padding: 4, borderRadius: 8, backgroundColor: "#ffffff" }}>
      <Svg ref={svg} width={200} height={200} viewBox={`0 0 ${qr.size} ${qr.size}`}
        accessible accessibilityRole="image" accessibilityLabel={label}>
        <Rect width={qr.size} height={qr.size} fill="#ffffff" />
        <Path d={qr.path} fill="#000000" />
      </Svg>
    </View>
    <ReadState error={share.error} message={t("Kode QR tidak dapat dibagikan.", "Could not share the QR code.")} />
    {Platform.OS !== "web" && <View style={styles.actions}>
      <Control label={t("Bagikan PNG", "Share PNG")} busy={share.busy} onPress={() => { void share.run(sharePng); }} />
    </View>}
  </>;
}
