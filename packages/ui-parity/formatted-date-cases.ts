import type { FormattedDateInput } from "../../lib/date-utils/display";
import { parityFrame } from "./frame";

export const formattedDateCases = [
  {
    id: "formatted-date-reflection-id-light",
    theme: "light",
    role: "label",
    prefix: "Minggu 6 Jan -",
    date: 1_736_665_200,
    options: { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" },
    expected: "12 Jan 2025",
    reference: "components/student-reflections-view.tsx",
  },
  {
    id: "formatted-date-cache-en-dark",
    theme: "dark",
    role: "caption",
    prefix: "Version 2",
    date: "2025-01-11T17:05:00.000Z",
    locale: "en-US",
    options: { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" },
    expected: "Jan 12, 2025, 12:05 AM",
    reference: "components/admin/offline-cache-settings.tsx",
  },
  {
    id: "formatted-date-reflection-invalid-light",
    theme: "light",
    role: "label",
    prefix: "Minggu 2025-unknown",
    date: "2025-unknown",
    options: { day: "numeric", month: "short", year: "numeric" },
    expected: null,
    reference: "components/student-reflections-view.tsx",
  },
] as const satisfies readonly (FormattedDateInput & {
  id: string;
  theme: "light" | "dark";
  role: "label" | "caption";
  prefix: string;
  expected: string | null;
  reference: string;
})[];

export type FormattedDateCaseSpec = typeof formattedDateCases[number];

export function getFormattedDatePosition() {
  return { position: "absolute", left: 32, top: 40, width: parityFrame.width - 64, gap: 8 } as const;
}
