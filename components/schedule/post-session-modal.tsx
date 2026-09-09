"use client";

import { SessionDetailDrawer } from "@/components/schedule/session-detail-drawer";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any | null;
  onSuccess: () => void | Promise<void>;
  currentUserId?: string;
};

/** Compatibility entry point. Post-session work lives in SessionDetailDrawer. */
export function PostSessionModal({
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
      role="teacher"
      currentUserId={currentUserId || booking?.slot?.tutorId || ""}
      onSuccess={onSuccess}
    />
  );
}
