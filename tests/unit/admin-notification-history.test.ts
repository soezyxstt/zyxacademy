import { expect, test } from "bun:test";
import { adminNotificationHistoryFields } from "../../packages/academic/admin-notification-history";

test("uses a readable category and distinct read and delivery states for signed Admin history", () => {
  const field = (attempted: number, succeeded: number, failedCount: number) =>
    adminNotificationHistoryFields({ type: "quiz_graded", read: true, attempted, succeeded, failedCount });
  expect(field(0, 0, 0)).toEqual({ type: "Nilai kuis", read: "Sudah dibaca", delivery: "Tanpa perangkat" });
  expect(field(2, 2, 0).delivery).toBe("Terkirim");
  expect(field(3, 2, 1).delivery).toBe("Terkirim sebagian");
  expect(field(2, 0, 2).delivery).toBe("Gagal");
  expect(adminNotificationHistoryFields({ type: "__proto__", read: false, attempted: 0, succeeded: 0, failedCount: 0 }))
    .toMatchObject({ type: "Lainnya", read: "Belum dibaca" });
});
