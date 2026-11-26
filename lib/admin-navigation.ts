import {
  LayoutDashboard,
  KeyRound,
  ListChecks,
  GraduationCap,
  Bell,
  Megaphone,
  CalendarDays,
  Link as LinkIcon,
  Newspaper,
  Video,
  FileText,
  BookOpen,
  Library,
  UserCheck,
  UserCog,
  Users,
  FilePen,
  Gauge,
  LineChart,
  Lock,
  Globe,
  Image as ImageIcon,
  MousePointerClick,
  Activity,
  Calculator,
  Cpu,
  MessageSquareText,
} from "lucide-react";

// PKA tabs default archived per user request
export const DEFAULT_ARCHIVED = [
  "pka-registrations",
  "pka-announcements",
  "pka-schedules",
  "pka-quizzes",
  "pka-materials",
];

export type AdminTabGroup =
  | "utama"
  | "akademik"
  | "pengguna"
  | "publikasi"
  | "analitik"
  | "sistem"
  | "utilitas"
  | "tutorial-pka";

export const ADMIN_GROUP_MESSAGE_KEYS = {
  akademik: "academicContent",
  pengguna: "usersAccess",
  publikasi: "publishingContent",
  analitik: "analyticsMonitor",
  sistem: "system",
  "tutorial-pka": "pka",
} as const;

export type AdminTabDef = {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  group: AdminTabGroup;
  exact?: boolean;
  badge?: React.ReactNode | string;
};

export const ALL_ADMIN_TABS: AdminTabDef[] = [
  // Utama
  { id: "dashboard", label: "Panel Admin", href: "/admin", icon: LayoutDashboard, group: "utama", exact: true },

  // Akademik
  { id: "courses", label: "Mata Kuliah", href: "/admin/courses", icon: GraduationCap, group: "akademik" },
  { id: "schedules", label: "Jadwal Umum", href: "/admin/schedules", icon: CalendarDays, group: "akademik" },
  { id: "meet", label: "Meet", href: "/admin/meet", icon: Video, group: "akademik" },
  { id: "bank-soal", label: "Bank Soal", href: "/admin/questions", icon: Library, group: "akademik" },
  { id: "discussions", label: "Diskusi dan laporan", href: "/admin/discussions", icon: MessageSquareText, group: "akademik" },

  // Pengguna & Akses
  { id: "users", label: "Pengguna", href: "/admin/users", icon: UserCog, group: "pengguna" },
  { id: "groups", label: "Kelompok Belajar", href: "/admin/groups", icon: Users, group: "pengguna" },
  { id: "tokens", label: "Token Aktivasi", href: "/admin/tokens", icon: KeyRound, group: "pengguna" },
  { id: "pricing", label: "Kalkulator Harga", href: "/admin/pricing", icon: Calculator, group: "pengguna" },
  { id: "notifications", label: "Notifikasi", href: "/admin/notifications", icon: Bell, group: "pengguna" },

  // Publikasi & Konten
  { id: "blog", label: "Blog", href: "/admin/blog", icon: Newspaper, group: "publikasi" },
  { id: "forms", label: "Form Studio", href: "/admin/forms", icon: FilePen, group: "publikasi" },
  { id: "media", label: "Pustaka Media", href: "/admin/media", icon: ImageIcon, group: "publikasi" },
  { id: "tautan", label: "Tautan Publik", href: "/admin/tautan", icon: LinkIcon, group: "publikasi" },
  { id: "short-links", label: "Short Links", href: "/admin/ops/short-links", icon: LinkIcon, group: "publikasi" },

  // Analitik & Monitor
  { id: "web-analytics", label: "Web Analytics", href: "/admin/ops/web-analytics", icon: Globe, group: "analitik" },
  { id: "ops-monitor", label: "Monitor Ops", href: "/admin/ops", icon: Gauge, group: "analitik", exact: true },
  { id: "ai-analytics", label: "Analitik Zyra", href: "/admin/ops/analytics", icon: LineChart, group: "analitik" },
  { id: "feature-usage", label: "Penggunaan Fitur", href: "/admin/ops/feature-usage", icon: MousePointerClick, group: "analitik" },
  { id: "tutor-activity", label: "Aktivitas Tutor", href: "/admin/ops/tutor-activity", icon: Activity, group: "analitik" },

  // Sistem
  { id: "ai-models", label: "Model AI", href: "/admin/ops/models", icon: Cpu, group: "sistem" },
  { id: "api-keys", label: "API Keys", href: "/admin/ops/keys", icon: Lock, group: "sistem" },

  // Utilitas
  { id: "docs", label: "Dokumentasi", href: "/admin/docs", icon: BookOpen, group: "utilitas" },

  // Tutorial PKA (Default Archived)
  { id: "pka-registrations", label: "Pendaftar PKA", href: "/admin/tutorial-pka/registrations", icon: UserCheck, group: "tutorial-pka" },
  { id: "pka-announcements", label: "Pengumuman PKA", href: "/admin/tutorial-pka/announcements", icon: Megaphone, group: "tutorial-pka" },
  { id: "pka-schedules", label: "Jadwal Live PKA", href: "/admin/tutorial-pka/schedules", icon: CalendarDays, group: "tutorial-pka" },
  { id: "pka-quizzes", label: "Kuis PKA", href: "/admin/courses/tutorial-pka/quizzes", icon: ListChecks, group: "tutorial-pka" },
  { id: "pka-materials", label: "Materi PKA", href: "/admin/courses/tutorial-pka/documents", icon: FileText, group: "tutorial-pka" },
];

export const ADMIN_TAB_MESSAGE_KEYS: Record<string, string> = {
  dashboard: "dashboard", blog: "blog", courses: "courses", schedules: "schedules",
  "bank-soal": "questionBank", pricing: "pricing", docs: "docs", forms: "forms", meet: "meet",
  media: "media", tautan: "publicLinks", users: "users", groups: "groups", tokens: "tokens",
  notifications: "notifications", "ops-monitor": "opsMonitor", "ai-models": "aiModels",
  "tutor-activity": "tutorActivity", "ai-analytics": "zyraAnalytics",
  "feature-usage": "featureUsage", "api-keys": "apiKeys", "short-links": "shortLinks",
  "web-analytics": "webAnalytics", "pka-registrations": "pkaRegistrations",
  "pka-announcements": "pkaAnnouncements", "pka-schedules": "pkaSchedules",
  "pka-quizzes": "pkaQuizzes", "pka-materials": "pkaMaterials",
};
