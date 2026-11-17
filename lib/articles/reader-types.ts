import type { PublicArticleReadModel } from "./structured-read-model";
import type { MaterialReaderMode } from "@/lib/materials/reader-mode";

export interface MaterialNavigationItem {
  id: string;
  title: string;
  href: string;
}

export interface StructuredArticleReaderProps {
  article: PublicArticleReadModel;
  course?: { id?: string; title: string } | null;
  mode?: MaterialReaderMode;
  pythonBrowserOnly?: boolean;
  backHref?: string;
  prevMaterial?: MaterialNavigationItem | null;
  nextMaterial?: MaterialNavigationItem | null;
  isTocOpen?: boolean;
  onToggleToc?: () => void;
  isMobileSheetOpen?: boolean;
  onToggleMobileSheet?: (open: boolean) => void;
  /** Isolated reader actions, used when private student services are unavailable. */
  adapter?: { onComplete: () => void; completed: boolean; ready: boolean };
}
