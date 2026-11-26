"use client";

import { useState } from "react";
import { NotificationInboxPanel } from "@/components/notifications/notification-inbox-panel";
import { notificationInboxCopy, type NotificationInboxCaseSpec } from "@/packages/ui-parity/notification-inbox-cases";

export function NotificationInboxCase({ item }: { item: NotificationInboxCaseSpec }) {
  const [rows, setRows] = useState(item.rows);
  const [destination, setDestination] = useState<string>();
  const copy = notificationInboxCopy[item.locale];
  return (
    <>
      <NotificationInboxPanel
        locale={item.locale} now={item.now} rows={rows} unread={rows.filter(row => !row.read).length}
        copy={{ ...copy, relative: (unit, count) => copy.relative[unit].replace("{count}", String(count)) }}
        onMarkAllRead={() => setRows(rows.map(row => ({ ...row, read: true })))}
        onSelect={row => {
          setRows(rows.map(entry => entry.id === row.id ? { ...entry, read: true } : entry));
          if (typeof row.metadata.url === "string") setDestination(row.metadata.url);
        }}
      />
      {destination && <p data-inbox-fixture-destination>{destination}</p>}
    </>
  );
}
