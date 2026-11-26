"use client";

import { useState } from "react";
import { NotificationInboxPanel, notificationInboxPanelSurface } from "@/components/notifications/notification-inbox-panel";
import { notificationInboxCopy, notificationInboxFixtureGutter, type NotificationInboxCaseSpec } from "@/packages/ui-parity/notification-inbox-cases";

export function NotificationInboxCase({ item }: { item: NotificationInboxCaseSpec }) {
  const [rows, setRows] = useState(item.rows);
  const [destination, setDestination] = useState<string>();
  const [closed, setClosed] = useState(false);
  const copy = notificationInboxCopy[item.locale];
  if (closed) return null;
  return (
    <>
      <div className={`${notificationInboxPanelSurface} overflow-hidden`} data-notification-inbox-panel
        style={{ marginInline: notificationInboxFixtureGutter }}>
        <NotificationInboxPanel
          locale={item.locale} now={item.now} rows={rows} unread={rows.filter(row => !row.read).length}
          copy={{ ...copy, relative: (unit, count) => copy.relative[unit].replace("{count}", String(count)) }}
          onClose={() => setClosed(true)}
          onMarkAllRead={() => setRows(rows.map(row => ({ ...row, read: true })))}
          onSelect={row => {
            setRows(rows.map(entry => entry.id === row.id ? { ...entry, read: true } : entry));
            if (typeof row.metadata.url === "string") setDestination(row.metadata.url);
          }}
        />
      </div>
      {destination && <p data-inbox-fixture-destination>{destination}</p>}
    </>
  );
}
