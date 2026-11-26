import { useState } from "react";
import { Text, View } from "react-native";
import { nativeColors } from "../../packages/design-tokens/native-colors";
import type { NotificationInboxCaseSpec } from "../../packages/ui-parity/notification-inbox-cases";
import { InboxContent } from "./features/notification-inbox/content";
import { nativeTypography } from "./typography";

export function NotificationInboxCase({ item }: { item: NotificationInboxCaseSpec }) {
  const [rows, setRows] = useState(() => item.rows.map(row => ({ ...row, href: row.metadata.url })));
  const [destination, setDestination] = useState<string | null>(null);
  const unread = rows.filter(row => !row.read).length;
  return (
    <View style={{ marginHorizontal: 16, marginVertical: 8 }}>
      <InboxContent locale={item.locale} theme={item.theme} now={item.now} unread={unread} rows={rows} testID={item.id}
        onMarkAllRead={() => setRows(rows.map(row => ({ ...row, read: true })))}
        onSelect={row => {
          setRows(rows.map(entry => entry.id === row.id ? { ...entry, read: true } : entry));
          setDestination(row.href);
        }} />
      {destination && <Text testID={`${item.id}-destination`}
        style={[nativeTypography.bodyRegular, { color: nativeColors[item.theme].foreground }]}>{destination}</Text>}
    </View>
  );
}
