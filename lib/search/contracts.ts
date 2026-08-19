/**
 * Contracts and type definitions for site-wide semantic search.
 */

export type RoleLevel = 0 | 1 | 2 | 3;

export const ROLE_LEVELS = {
  PUBLIC: 0,
  STUDENT: 1,
  TUTOR: 2,
  ADMIN: 3,
} as const satisfies Record<string, RoleLevel>;

export type SearchCategory =
  | "Course & Modul"
  | "Materi & Artikel"
  | "Kuis & Evaluasi"
  | "Navigasi"
  | "Administrasi";

export type SearchPrefixType =
  | "group"
  | "meet"
  | "user"
  | "form"
  | "token"
  | "schedule";

export interface ParsedSearchQuery {
  rawQuery: string;
  cleanQuery: string;
  isScoped: boolean;
  prefixType?: SearchPrefixType;
  entityType?: string;
  prefixLabel?: string;
}

export interface SearchDocumentMetadata {
  title: string;
  subtitle?: string;
  href: string;
  category: SearchCategory | string;
  entity_type: string;
  entity_id: string;
  course_id?: string;
  min_role: RoleLevel;
  keywords?: string;
  [key: string]: unknown;
}

export interface SearchDocumentRecord {
  id: string;
  title: string;
  content: string;
  subtitle?: string;
  href: string;
  category: SearchCategory | string;
  entity_type: string;
  entity_id: string;
  course_id?: string;
  min_role: RoleLevel;
  keywords?: string;
  metadata?: Record<string, string | number | boolean>;
  is_synced?: boolean;
  createdAt?: Date | string | number;
  updatedAt?: Date | string | number;
}

export interface SiteSearchQuery {
  q: string;
  limit?: number;
  roleLevel?: RoleLevel;
  courseId?: string;
  entityType?: string;
  enrolledCourseIds?: string[];
}

export interface SiteSearchMatch {
  id: string;
  score: number;
  metadata: {
    title: string;
    subtitle?: string;
    href: string;
    category: SearchCategory | string;
    entity_type?: string;
    entity_id?: string;
    course_id?: string;
    min_role?: RoleLevel;
    keywords?: string;
    [key: string]: unknown;
  };
}

export interface SiteSearchGroupedResults {
  "Course & Modul": SiteSearchMatch[];
  "Materi & Artikel": SiteSearchMatch[];
  "Kuis & Evaluasi": SiteSearchMatch[];
  "Navigasi": SiteSearchMatch[];
  "Administrasi": SiteSearchMatch[];
}

export interface SiteSearchResponse {
  query: string;
  total: number;
  grouped: SiteSearchGroupedResults;
  matches?: SiteSearchMatch[];
}
