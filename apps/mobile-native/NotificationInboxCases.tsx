import { useState } from "react";
import { Text, View } from "react-native";
import { nativeColors } from "../../packages/design-tokens/native-colors";
import { notificationInboxFixtureGutter, type NotificationInboxCaseSpec } from "../../packages/ui-parity/notification-inbox-cases";
import { InboxContent, InboxHeader, inboxPanelSurface } from "./features/notification-inbox/content";
import { nativeTypography } from "./typography";

export function NotificationInboxCase({ item }: { item: NotificationInboxCaseSpec }) {
  const [rows, setRows] = useState(() => item.rows.map(row => ({ ...row, href: row.metadata.url })));
  const [destination, setDestination] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const unread = rows.filter(row => !row.read).length;
  if (closed) return null;
  return (
    <View style={{ marginHorizontal: notificationInboxFixtureGutter }}>
      <View style={inboxPanelSurface(item.theme)}>
        <InboxHeader locale={item.locale} theme={item.theme} unread={unread} testID={item.id}
          onClose={() => setClosed(true)} onMarkAllRead={() => setRows(rows.map(row => ({ ...row, read: true })))} />
        <InboxContent locale={item.locale} theme={item.theme} now={item.now} rows={rows} testID={item.id}
          onSelect={row => {
            setRows(rows.map(entry => entry.id === row.id ? { ...entry, read: true } : entry));
            setDestination(row.href);
          }} />
      </View>
      {destination && <Text testID={`${item.id}-destination`}
        style={[nativeTypography.bodyRegular, { color: nativeColors[item.theme].foreground }]}>{destination}</Text>}
    </View>
  );
}
