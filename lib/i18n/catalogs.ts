import type { Locale } from "@/lib/i18n/locale";

export type MessageCatalog = Record<string, unknown>;

type CatalogModule = { default: MessageCatalog };
type CatalogLoader = () => Promise<CatalogModule>;

const catalogLoaders: Record<Locale, Record<string, CatalogLoader>> = {
  id: {
    core: () => import("../../messages/id/core.json"),
    common: () => import("../../messages/id/common.json"),
    auth: () => import("../../messages/id/auth.json"),
    student: () => import("../../messages/id/student.json"),
    studentCourse: () => import("../../messages/id/studentCourse.json"),
    studentExtras: () => import("../../messages/id/studentExtras.json"),
    learning: () => import("../../messages/id/learning.json"),
    zyra: () => import("../../messages/id/zyra.json"),
    admin: () => import("../../messages/id/admin.json"),
    adminAcademic: () => import("../../messages/id/adminAcademic.json"),
    adminReviewProduct: () => import("../../messages/id/adminReviewProduct.json"),
    adminOps: () => import("../../messages/id/adminOps.json"),
    adminEval: () => import("../../messages/id/adminEval.json"),
    adminForms: () => import("../../messages/id/adminForms.json"),
    adminMedia: () => import("../../messages/id/adminMedia.json"),
    tutor: () => import("../../messages/id/tutor.json"),
    consent: () => import("../../messages/id/consent.json"),
    notifications: () => import("../../messages/id/notifications.json"),
    search: () => import("../../messages/id/search.json"),
    publicForms: () => import("../../messages/id/publicForms.json"),
    marketing: () => import("../../messages/id/marketing.json"),
    schedule: () => import("../../messages/id/schedule.json"),
    ui: () => import("../../messages/id/ui.json"),
  },
  en: {
    core: () => import("../../messages/en/core.json"),
    common: () => import("../../messages/en/common.json"),
    auth: () => import("../../messages/en/auth.json"),
    student: () => import("../../messages/en/student.json"),
    studentCourse: () => import("../../messages/en/studentCourse.json"),
    studentExtras: () => import("../../messages/en/studentExtras.json"),
    learning: () => import("../../messages/en/learning.json"),
    zyra: () => import("../../messages/en/zyra.json"),
    admin: () => import("../../messages/en/admin.json"),
    adminAcademic: () => import("../../messages/en/adminAcademic.json"),
    adminReviewProduct: () => import("../../messages/en/adminReviewProduct.json"),
    adminOps: () => import("../../messages/en/adminOps.json"),
    adminEval: () => import("../../messages/en/adminEval.json"),
    adminForms: () => import("../../messages/en/adminForms.json"),
    adminMedia: () => import("../../messages/en/adminMedia.json"),
    tutor: () => import("../../messages/en/tutor.json"),
    consent: () => import("../../messages/en/consent.json"),
    notifications: () => import("../../messages/en/notifications.json"),
    search: () => import("../../messages/en/search.json"),
    publicForms: () => import("../../messages/en/publicForms.json"),
    marketing: () => import("../../messages/en/marketing.json"),
    schedule: () => import("../../messages/en/schedule.json"),
    ui: () => import("../../messages/en/ui.json"),
  },
};

const defaultNamespaces = [
  "core", "common", "auth", "student", "studentCourse", "studentExtras",
  "learning", "zyra", "admin", "adminAcademic", "adminReviewProduct", "adminOps", "adminEval",
  "adminForms", "adminMedia", "tutor", "consent", "notifications", "search",
  "publicForms", "marketing", "schedule", "ui",
];

export async function loadMessages(locale: Locale, namespaces?: string[]): Promise<Record<string, MessageCatalog>> {
  const selectedNamespaces = namespaces ?? defaultNamespaces;
  const entries = await Promise.all(selectedNamespaces.map(async (namespace) => {
    const load = catalogLoaders[locale][namespace];
    if (!load) throw new Error(`Unknown i18n namespace: ${namespace}`);
    const catalog = await load();
    return [namespace, catalog.default] as const;
  }));
  return Object.fromEntries(entries);
}
