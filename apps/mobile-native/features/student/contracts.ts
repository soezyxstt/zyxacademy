import type { OfflineLibraryTarget } from "./offline-courses";
import type { ReactNode } from "react";
import type { NativePushStatus } from "../../device/notifications-controller";
import type { ShareFileResult } from "../../device/file-controller";
import type { NativeResponse } from "../../network/transport";

export interface StudentSession {
  userId: string;
  role: "student";
  sessionId?: string;
  origin: string;
  locale: string;
}

export interface StudentRoute {
  pattern: string;
  path: string;
  params: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string>>;
}

export type StudentResponse = Pick<NativeResponse, "ok" | "status" | "headers" | "json" | "text" | "arrayBuffer"> & { dispose?(): void };
export type StudentRequest = (path: string, init?: RequestInit) => Promise<StudentResponse>;

export type StudentMaterialReaderTarget = {
  courseId: string;
  materialId: string;
  section?: string;
  page?: number;
} & ({ kind: "article" } | { kind: "pdf"; webPath: string });

export interface StudentServices {
  session: StudentSession;
  /** Transport bound to the current session. Only relative API paths are passed. */
  request: StudentRequest;
  /** The host isolates storage by session, account, origin and locale and purges it on logout. */
  drafts?: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  offlineCourse?: {
    status: "inactive" | "loading" | "syncing" | "ready" | "offline" | "error" | "revoked";
    course: { id: string; title: string; materials: ReadonlyArray<{ id: string; title: string; kind: string }> } | null;
    retry(): void;
  };
  openOfflineLibrary?: (target?: OfflineLibraryTarget) => void;
  openOfflineMaterial?: (courseId: string, materialId: string) => void;
  renderMaterial?: (target: StudentMaterialReaderTarget) => ReactNode;
  saveDiktatPdf?: (courseId: string, diktatId: string, signal: AbortSignal) => Promise<ShareFileResult>;
  openExternal?: (path: string) => void;
  /** Opens the browser notification settings in an existing browser profile. */
  openBrowserNotifications?: () => void;
  nativeAuthScheme?: string;
  onLocaleChanged?(locale: "id" | "en"): void;
  devicePush?: {
    status: NativePushStatus | null;
    requestPermission(): Promise<NativePushStatus | null>;
    refresh(): Promise<NativePushStatus | null>;
  };
  devicePreferences?: {
    theme: "light" | "dark" | "system";
    setTheme(theme: "light" | "dark" | "system"): void;
    haptics: boolean;
    setHaptics(enabled: boolean): void;
  };
  notifications?: { enabled: boolean; setEnabled(enabled: boolean): Promise<void> };
  pickAssessmentFile?: () => Promise<import("./assessment/device-contract").AssessmentFile | null>;
  assessmentPhotos?: import("./assessment/device-contract").AssessmentPhotoPicker;
  renderAssessmentMarkdown?: (markdown: string, courseId: string) => ReactNode;
  renderAssessmentParts?: (parts: unknown[], courseId: string, visuals?: unknown[]) => ReactNode;
  /** Fixed timezone for results screenshots from the internal synthetic fixture. */
  resultsTimeZone?: string;
}

export interface StudentScreenProps extends StudentServices {
  route: StudentRoute;
  /** Mounted stack entries may be covered by another route. Defaults to focused for standalone screens. */
  focused?: boolean;
  navigate(path: string): void;
  replace(path: string): void;
  back(): void;
  initialScrollY: number;
  onScrollY(y: number): void;
}
