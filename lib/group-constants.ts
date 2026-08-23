export type PackageType = "reguler_15" | "intensif_30" | "super_intensif_45" | "custom";

export const PACKAGE_PRESETS: Record<
  PackageType,
  { name: string; quota: number; weeklySessions: number; frequencyLabel: string }
> = {
  reguler_15: {
    name: "Paket Reguler (15 Sesi)",
    quota: 15,
    weeklySessions: 1,
    frequencyLabel: "1x seminggu",
  },
  intensif_30: {
    name: "Paket Intensif (30 Sesi)",
    quota: 30,
    weeklySessions: 2,
    frequencyLabel: "2x seminggu",
  },
  super_intensif_45: {
    name: "Paket Super Intensif (45 Sesi)",
    quota: 45,
    weeklySessions: 3,
    frequencyLabel: "3x seminggu",
  },
  custom: {
    name: "Paket Kustom",
    quota: 15,
    weeklySessions: 2,
    frequencyLabel: "Kustom",
  },
};
