export type LinkColorKey =
  | "neutral"
  | "brand"
  | "brand-secondary"
  | "tertiary-1"
  | "tertiary-2"
  | "tertiary-3"
  | "success"
  | "info"
  | "warning"
  | "error";

export type LinkColorConfig = {
  key: LinkColorKey;
  label: string;
  dot: string;
  text: string;
  tile: string;
};

export const LINK_COLORS: LinkColorConfig[] = [
  { key: "neutral", label: "Netral", dot: "bg-muted-foreground", text: "text-muted-foreground", tile: "bg-muted text-muted-foreground" },
  { key: "brand", label: "Brand", dot: "bg-brand-primary", text: "text-brand-primary", tile: "bg-brand-primary/10 text-brand-primary" },
  { key: "brand-secondary", label: "Brand Sekunder", dot: "bg-brand-secondary", text: "text-brand-secondary", tile: "bg-brand-secondary/10 text-brand-secondary" },
  { key: "tertiary-1", label: "Teal", dot: "bg-tertiary-1", text: "text-tertiary-1", tile: "bg-tertiary-1/10 text-tertiary-1" },
  { key: "tertiary-2", label: "Kuning", dot: "bg-tertiary-2", text: "text-tertiary-2", tile: "bg-tertiary-2/10 text-tertiary-2" },
  { key: "tertiary-3", label: "Biru Muda", dot: "bg-tertiary-3", text: "text-tertiary-3", tile: "bg-tertiary-3/10 text-tertiary-3" },
  { key: "success", label: "Sukses", dot: "bg-status-success", text: "text-status-success", tile: "bg-status-success/10 text-status-success" },
  { key: "info", label: "Info", dot: "bg-status-info", text: "text-status-info", tile: "bg-status-info/10 text-status-info" },
  { key: "warning", label: "Peringatan", dot: "bg-status-warning", text: "text-status-warning", tile: "bg-status-warning/10 text-status-warning" },
  { key: "error", label: "Galat", dot: "bg-status-error", text: "text-status-error", tile: "bg-status-error/10 text-status-error" },
];

export function linkColor(key?: string | null): LinkColorConfig {
  return LINK_COLORS.find((c) => c.key === key) ?? LINK_COLORS[0];
}

export const DEFAULT_ICON = "🔗";

export const EMOJI_OPTIONS = [
  "🔗", "📚", "🎓", "📝", "📊", "💬", "📢", "👥",
  "🌐", "📅", "📁", "⭐", "🎯", "💡", "🔔", "🤝",
  "📞", "✉️", "🧠", "🏆",
];

export const LINK_CATEGORY_SUGGESTIONS = [
  "Sosial Media",
  "Dokumen",
  "Materi Belajar",
  "Komunitas",
  "Kontak",
  "Lainnya",
];

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeCategory(value?: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}
