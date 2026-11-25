export type AdminHomeIconKey =
  | "graduation-cap"
  | "calendar-days"
  | "library"
  | "trophy"
  | "zap"
  | "calculator"
  | "newspaper"
  | "file-text"
  | "video"
  | "image"
  | "link"
  | "key-round"
  | "bell"
  | "activity"
  | "flag"
  | "line-chart"
  | "mouse-pointer-click"
  | (string & {});

export interface AdminHomeItem {
  title: string;
  iconKey: AdminHomeIconKey;
  iconColor: string;
  href: string;
  stat: string | null;
}

export interface AdminHomeCategory {
  name: string;
  items: AdminHomeItem[];
}

export interface AdminHomeKpiCounts {
  totalCourses: number;
  pendingQuestions: number;
  runningJobs: number;
  aiRequestsToday: number;
}

export interface AdminHomeViewProps {
  failedJobs: number;
  kpis?: AdminHomeKpiCounts;
  categories: AdminHomeCategory[];
}
