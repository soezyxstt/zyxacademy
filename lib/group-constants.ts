export type PackageType = "reguler_15" | "intensif_30" | "super_intensif_45" | "custom";

export const PACKAGE_PRESETS: Record<
  PackageType,
  { name: string; quota: number; weeklySessions: number; frequencyLabel: string }
> = {
  reguler_15: {
    name: "Paket Reguler (15 Sesi)",
    quota: 15,
    weeklySessions: 15,
    frequencyLabel: "Fleksibel",
  },
  intensif_30: {
    name: "Paket Intensif (30 Sesi)",
    quota: 30,
    weeklySessions: 30,
    frequencyLabel: "Fleksibel",
  },
  super_intensif_45: {
    name: "Paket Super Intensif (45 Sesi)",
    quota: 45,
    weeklySessions: 45,
    frequencyLabel: "Fleksibel",
  },
  custom: {
    name: "Paket Kustom",
    quota: 15,
    weeklySessions: 15,
    frequencyLabel: "Fleksibel",
  },
};
