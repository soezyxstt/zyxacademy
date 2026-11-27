import { parityFrame } from "./frame";

export type AlertCaseSpec = {
  id: string;
  theme: "light" | "dark";
  variant: "default" | "destructive";
  title: string;
  description?: string;
  icon?: "info" | "zap";
  action?: { label: string; href: "/admin/jobs" };
};

export const alertCases = [
  { id: "alert-title-light", theme: "light", variant: "default", title: "Unduhan siap" },
  {
    id: "alert-with-description-dark", theme: "dark", variant: "default", icon: "info",
    title: "Device push notifications", description: "Permission granted, device not registered.",
  },
  {
    id: "alert-destructive-action-light", theme: "light", variant: "destructive", icon: "zap",
    title: "3 generasi soal gagal", action: { label: "Tinjau generasi", href: "/admin/jobs" },
  },
] as const satisfies readonly AlertCaseSpec[];

export const alertPosition = {
  position: "absolute",
  top: 8,
  left: 16,
  width: parityFrame.width - 32,
} as const;
