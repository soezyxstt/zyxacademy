import { expect, test } from "bun:test";
import { formatNotificationTime } from "../../lib/date-utils/notification-display";
import { getParityFrameHeight, parityFrame } from "../../packages/ui-parity/frame";
import { galleryCases } from "../../packages/ui-parity/gallery";
import { notificationInboxCases, notificationInboxCopy } from "../../packages/ui-parity/notification-inbox-cases";
import { notificationAppearance } from "../../packages/ui-primitives/notification-appearance";

test("the gallery uses one ordered empty, unread, and mixed Student inbox fixture on both platforms", () => {
  const cases = galleryCases.filter(item => item.family === "notification-inbox");
  expect(cases.map(item => item.id)).toEqual(notificationInboxCases.map(item => item.id));
  expect(cases.map(item => item.rows.map(row => row.read))).toEqual([[], [false], [false, true]]);
  expect(cases.map(item => item.locale)).toEqual(["id", "en", "id"]);
  expect(getParityFrameHeight("notification-inbox")).toBe(216);
  expect(getParityFrameHeight("progress")).toBe(parityFrame.height);
});

test("notification capture uses a fixed clock and the production localized relative labels", () => {
  const text = notificationInboxCases.flatMap(item => item.rows.map(row => {
    const copy = notificationInboxCopy[item.locale].relative;
    return formatNotificationTime(row.createdAt, item.locale, (unit, count) => copy[unit].replace("{count}", String(count)), item.now);
  }));
  expect(text).toEqual(["5 min ago", "2 j lalu", "1 h lalu"]);
  expect(formatNotificationTime("invalid", "en", () => "unexpected", 0)).toBe("");
});

test("known notification types select the same icons and semantic colors on both platforms", () => {
  expect(notificationAppearance("quiz_published")).toEqual({ icon: "clipboard-list", tone: "brand-primary" });
  expect(notificationAppearance("discussion")).toEqual({ icon: "messages-square", tone: "brand-primary" });
  expect(notificationAppearance("quiz_graded")).toEqual({ icon: "graduation-cap", tone: "success" });
  for (const unknown of [null, "__proto__", "future_type"]) {
    expect(notificationAppearance(unknown)).toEqual({ icon: "bell", tone: "muted" });
  }
});
