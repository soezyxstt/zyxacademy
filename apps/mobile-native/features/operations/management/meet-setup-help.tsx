import { useState } from "react";
import { Text, View } from "react-native";
import idMessages from "../../../../../messages/id/admin.json";
import enMessages from "../../../../../messages/en/admin.json";
import { SharedDialog } from "../../shared-ui/overlays";
import { Action, Copy, styles, useManagement } from "./ui";

export function MeetSetupHelp() {
  const { locale, theme, colors, openExternal } = useManagement();
  const [open, setOpen] = useState(false);
  const t = (locale === "en" ? enMessages : idMessages).googleSetup;

  return <>
    <Action variant="ghost" onPress={() => setOpen(true)} testID="admin-meet-google-setup">{t.title}</Action>
    {open && <SharedDialog open theme={theme} title={t.title} closeLabel={locale === "en" ? "Close" : "Tutup"} onDismiss={() => setOpen(false)}>
      <View style={styles.field}>
        <Copy>{t.meet}</Copy>
        <Copy>{t.client}</Copy>
        <Copy>{t.authorize}</Copy>
        <Text selectable style={[styles.copy, { color: colors.foreground }]}>
          {"https://www.googleapis.com/auth/drive.file\nhttps://www.googleapis.com/auth/meetings.space.created"}
        </Text>
        <Copy>{t.deploy}</Copy>
      </View>
      {openExternal && <View style={styles.row}>
        <Action onPress={() => openExternal("https://console.cloud.google.com/apis/library")}>{t.library}</Action>
        <Action onPress={() => openExternal("https://developers.google.com/oauthplayground/")}>OAuth Playground</Action>
      </View>}
    </SharedDialog>}
  </>;
}
