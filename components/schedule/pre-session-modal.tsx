"use client";

import { SessionDetailDrawer } from "@/components/schedule/session-detail-drawer";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any | null;
  onSuccess: () => void | Promise<void>;
  currentUserId?: string;
};

/** Compatibility entry point. Pre-session editing lives in SessionDetailDrawer. */
export function PreSessionModal({
  open,
  onOpenChange,
  booking,
  onSuccess,
  currentUserId,
}: Props) {
  return (
    <SessionDetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      booking={booking}
      role="student"
      currentUserId={currentUserId || booking?.studentId || ""}
      onSuccess={onSuccess}
    />
  );
}
