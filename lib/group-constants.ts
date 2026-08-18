export type PackageType = "reguler_15" | "intensif_30" | "super_intensif_45" | "custom";

export const PACKAGE_PRESETS: Record<PackageType, { name: string; quota: number; frequencyLabel: string }> = {
  reguler_15: {
    name: "Paket Reguler (15 Sesi)",
    quota: 15,
    frequencyLabel: "1x seminggu",
  },
  intensif_30: {
    name: "Paket Intensif (30 Sesi)",
    quota: 30,
    frequencyLabel: "2x seminggu",
  },
  super_intensif_45: {
    name: "Paket Super Intensif (45 Sesi)",
    quota: 45,
    frequencyLabel: "3x seminggu",
  },
  custom: {
    name: "Paket Kustom",
    quota: 15,
    frequencyLabel: "Kustom",
  },
};
