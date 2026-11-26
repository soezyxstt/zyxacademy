import { administrationCourses, type Bundle, type ReviewKind } from "./fixtures";

type Route = { pattern: string; fixture: string; web: string; title: string };

export const administrationRoutes = [
  { pattern: "/admin/authoring-context", fixture: "/admin/authoring-context", web: "authoring-context", title: "Konteks penulisan" },
  { pattern: "/admin/bundles/idea", fixture: "/admin/bundles/idea", web: "bundles/idea", title: "Idea Bundle" },
  { pattern: "/admin/bundles/product", fixture: "/admin/bundles/product", web: "bundles/product", title: "Product Bundle" },
  { pattern: "/admin/groups", fixture: "/admin/groups", web: "groups", title: "Kelompok belajar" },
  { pattern: "/admin/materials", fixture: "/admin/materials", web: "materials", title: "Materi" },
  { pattern: "/admin/materials/manual", fixture: "/admin/materials/manual", web: "materials/manual", title: "Penulisan materi" },
  { pattern: "/admin/materials/review", fixture: "/admin/materials/review?courseId=academic-course-1&section=idea", web: "materials/review", title: "Review materi" },
  { pattern: "/admin/materials/review/idea/[slug]", fixture: "/admin/materials/review/idea/academic-idea-1", web: "materials/review/idea/[slug]", title: "Review Idea Bundle" },
  { pattern: "/admin/materials/review/product/[slug]", fixture: "/admin/materials/review/product/academic-product-1", web: "materials/review/product/[slug]", title: "Review Product Bundle" },
  { pattern: "/admin/notifications", fixture: "/admin/notifications", web: "notifications", title: "Notifikasi" },
  { pattern: "/admin/schedules", fixture: "/admin/schedules", web: "schedules", title: "Jadwal akademik" },
  { pattern: "/admin/tokens", fixture: "/admin/tokens", web: "tokens", title: "Token pendaftaran" },
  { pattern: "/admin/tutorial-pka", fixture: "/admin/tutorial-pka", web: "tutorial-pka", title: "Tutorial PKA" },
  { pattern: "/admin/tutorial-pka/announcements", fixture: "/admin/tutorial-pka/announcements", web: "tutorial-pka/announcements", title: "Pengumuman PKA" },
  { pattern: "/admin/tutorial-pka/registrations", fixture: "/admin/tutorial-pka/registrations", web: "tutorial-pka/registrations", title: "Pendaftaran PKA" },
  { pattern: "/admin/tutorial-pka/schedules", fixture: "/admin/tutorial-pka/schedules", web: "tutorial-pka/schedules", title: "Jadwal PKA" },
  { pattern: "/admin/users", fixture: "/admin/users", web: "users", title: "Pengguna" },
  { pattern: "/admin/courses/[slug]/review/idea/[bundleId]", fixture: "/admin/courses/biologi-dasar/review/idea/academic-idea-1", web: "courses/[slug]/review/idea/[bundleId]", title: "Review Idea Bundle" },
  { pattern: "/admin/courses/[slug]/review/product/[bundleId]", fixture: "/admin/courses/biologi-dasar/review/product/academic-product-1", web: "courses/[slug]/review/product/[bundleId]", title: "Review Product Bundle" },
] as const satisfies readonly Route[];

export type AdministrationPattern = (typeof administrationRoutes)[number]["pattern"];
type Parameters = Readonly<Record<string, string>>;
type Redirect = { type: "redirect"; target: string } | { type: "missing" } | { type: "screen" };
const courseReview = (slug: string) => `/admin/courses/${encodeURIComponent(slug)}/review`;

export function resolveAdministrationRedirect(pattern: AdministrationPattern, params: Parameters, query: Parameters, bundles: readonly Bundle[]): Redirect {
  switch (pattern) {
    case "/admin/authoring-context":
    case "/admin/materials/manual":
      return { type: "redirect", target: "/admin/courses" };
    case "/admin/bundles/idea":
      return { type: "redirect", target: "/admin/materials/review?section=idea" };
    case "/admin/bundles/product":
      return { type: "redirect", target: "/admin/materials/review?section=product" };
    case "/admin/materials":
      return { type: "redirect", target: "/admin/materials/review?section=catalog" };
    case "/admin/tutorial-pka":
      return { type: "redirect", target: "/admin/tutorial-pka/registrations" };
    case "/admin/materials/review": {
      const course = administrationCourses.find((entry) => entry.id === query.courseId || entry.slug === query.courseId);
      if (!course) return { type: "redirect", target: "/admin/courses" };
      const tab = query.tab || (query.section ? (query.section === "product" ? "product" : "idea") : "");
      return { type: "redirect", target: courseReview(course.slug) + (tab ? `?tab=${encodeURIComponent(tab)}` : "") };
    }
    case "/admin/materials/review/idea/[slug]":
    case "/admin/materials/review/product/[slug]": {
      if (!params.slug) return { type: "redirect", target: "/admin/courses" };
      const kind: ReviewKind = pattern.includes("/idea/") ? "idea" : "product";
      const bundle = bundles.find((entry) => entry.id === params.slug && entry.kind === kind);
      const course = administrationCourses.find((entry) => entry.id === bundle?.courseId);
      if (!bundle || !course) return { type: "missing" };
      return { type: "redirect", target: `${courseReview(course.slug)}/${kind}/${encodeURIComponent(bundle.id)}` };
    }
    default:
      return { type: "screen" };
  }
}

export function matchAdministrationRoute(path: string) {
  const segments = path.split("?")[0].split("/");
  for (const route of administrationRoutes) {
    const pattern = route.pattern.split("/");
    if (segments.length !== pattern.length) continue;
    if (pattern.every((segment, index) => segment.startsWith("[") || segment === segments[index])) return route;
  }
}

export function findAdministrationBundle(slug: string, bundleId: string, kind: ReviewKind, bundles: readonly Bundle[]) {
  const course = administrationCourses.find((entry) => entry.slug === slug || entry.id === slug);
  return course ? bundles.find((entry) => entry.kind === kind && entry.id === bundleId && entry.courseId === course.id) : undefined;
}

export const administrationCases = administrationRoutes.flatMap((route) =>
  ([["populated", "light"], ["empty", "light"], ["error", "dark"]] as const).map(([scenario, theme]) => ({
    id: `academic-administration-${route.web.replaceAll("/", "-").replace(/[\[\]]/g, "")}-${scenario}`,
    path: route.fixture,
    pattern: route.pattern,
    webSource: `app/(admin)/admin/(academic)/${route.web}/page.tsx`,
    scenario,
    theme,
  })),
);
