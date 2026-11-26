import { parseDemoSelection } from "../../../lib/demo/selection";
import { localizedPublicPath } from "../../../lib/public-locale-routes";
import type { EmailNotificationCategory } from "../../../lib/email-preferences/contracts";


export type PublicLocale = "id" | "en";
export type PublicTheme = "light" | "dark";

export type PublishedPublicRelease = {
  version: string;
  buildId: string | null;
  releaseUrl: string;
  downloads: {
    android: string | null;
    windows: string | null;
    linuxDeb: string | null;
    linuxAppImage: string | null;
  };
};

export const blogCategories = [
  { id: "tips_kuliah", key: "studyTips" },
  { id: "pojok_kampus", key: "campusCorner" },
  { id: "fakta_seru", key: "funFacts" },
  { id: "kegiatan_zyx", key: "zyxActivities" },
] as const;

export type BlogCategory = (typeof blogCategories)[number]["id"];
export const blogPageSize = 12;
export const blogFeaturedCount = 3;
export const blogCategoryPreviewCount = 3;

export function parseBlogQuery(category: string | null, page: string | null) {
  const requestedPage = Number(page ?? 1);
  return {
    category: blogCategories.find((item) => item.id === category)?.id ?? null,
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 1_000_000 ? requestedPage : 1,
  };
}

export function blogListHref(category: BlogCategory | null, page = 1) {
  if (!category) return "/blog";
  return `/blog?category=${category}${page === 1 ? "" : `&page=${page}`}`;
}

export function blogArticleHref(slug: string) {
  return `/blog/${encodeURIComponent(slug)}`;
}

export type PublicBlogCard = {
  slug: string;
  title: string;
  summary: string;
  category: BlogCategory;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  readMinutes: number;
};

export type PublicBlogList = {
  total: number;
  articles: PublicBlogCard[];
  sections: Array<{ category: BlogCategory; entries: PublicBlogCard[] }>;
};

export type PublicBlogDetail = {
  article: PublicBlogCard & { content: string; author: string | null };
  related: PublicBlogCard[];
};

export const publicStaticRoutes = [
  "/", "/about", "/download", "/forms-playground", "/plans", "/privacy", "/terms", "/testimonial",
] as const;

export const demoViews = [
  "pet", "discussions", "course-discussions", "feedback", "tryout-review", "quiz-review",
  "quiz-summary", "profile-edit", "reflections", "achievements", "leaderboard",
  "course-leaderboard", "playground", "live", "profile", "settings", "notifications",
  "groups", "schedule", "video", "path", "mastery", "tryout-list", "results", "quiz-list",
  "quiz-start", "documents", "overview", "courses", "progress", "history", "article",
  "diktat", "flashcards", "quiz", "tryout", "zyra",
] as const;
export type PublicDemoView = (typeof demoViews)[number];
export function isPublicDemoView(value: string): value is PublicDemoView {
  return demoViews.some((view) => view === value);
}

export type PublicDemoList = {
  showLive: boolean;
  courses: Array<{
    id: string;
    title: string;
    description: string | null;
    chapterTitle: string;
    article: { id: string; title: string } | null;
  }>;
};

export const nativeDemoContentViews = ["overview", "documents", "article", "diktat", "flashcards", "quiz-list", "quiz-start", "quiz"] as const;
export type NativeDemoContentView = (typeof nativeDemoContentViews)[number];

export function isNativeDemoContentView(value: string): value is NativeDemoContentView {
  return nativeDemoContentViews.some((view) => view === value);
}

export type PublicDemoContent =
  | { kind: "overview"; chapters: { id: string; title: string; orderIndex: number }[] }
  | { kind: "documents"; documents: { id: string; title: string; kind: "article" | "diktat"; collectionOffset: number }[] }
  | { kind: "article"; title: string; minutes: number; sections: { id: string; title: string; objective: string; blocks: { id: string; title: string | null; text: string }[] }[] }
  | { kind: "diktat"; title: string; sections: { title: string; content: string }[] }
  | { kind: "flashcards"; cards: { front: string; back: string; explanation: string | null }[]; nextOffset: number | null; offset: number }
  | { kind: "quiz-list" | "quiz-start" | "quiz"; courseId: string; offset: number; nextOffset: number | null; previousOffset: number | null; total: number; token: string; questions: { id: string; prompt: string; options: string[]; multiple: boolean }[] };

export type PublicQuizAnswers = { courseId: string; quizOffset: number; questionIds: string[]; questionSetToken: string; answers: number[][] };
export type PublicQuizResult = { score: number; total: number; results: { index: number; isCorrect: boolean; correctIndices: number[]; explanation: string | null }[] };

export function demoSearchParams(search: URLSearchParams) {
  return Object.fromEntries([...search.keys()].map((key) => {
    const values = search.getAll(key);
    return [key, values.length === 1 ? values[0] : values];
  }));
}

export function demoPageHref(href: string, offset: "quizOffset" | "flashcardOffset", next: number) {
  const [path, search = ""] = href.split("?", 2);
  const params = new URLSearchParams(search);
  if (next === 0) params.delete(offset);
  else params.set(offset, String(next));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export type PublicPlansQuery = {
  people: number;
  subjects: string[];
  otherSubjects: number;
};

export type PublicPlansData = {
  quotes: Array<{
    key: "minimal" | "essential" | "premium" | "free" | "custom";
    price: number;
    regularPrice: number;
    discountPercent: number;
    isIntroductory: boolean;
    contactUrl: string | null;
  }>;
};

export type PublicRoute =
  | { kind: "static"; path: (typeof publicStaticRoutes)[number] }
  | { kind: "blog"; category: BlogCategory | null; page: number }
  | { kind: "article"; slug: string }
  | { kind: "demo"; view: PublicDemoView | null; search: string; course?: string }
  | { kind: "unsubscribe"; status: string | null; category: string | null; token: string | null }
  | { kind: "missing" };

export function resolvePublicRoute(href: string): PublicRoute | null {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/\\")) return null;
  try {
    const segments = href.split(/[?#]/, 1)[0].split("/");
    if (segments.some((segment) => {
      const decoded = decodeURIComponent(segment);
      return decoded === "." || decoded === ".." || /[/\\\x00-\x1f]/.test(decoded);
    })) return null;
  } catch {
    return null;
  }
  const url = new URL(href, "https://native.invalid");
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (publicStaticRoutes.some((item) => item === path)) {
    return { kind: "static", path: path as (typeof publicStaticRoutes)[number] };
  }
  if (path === "/blog") return { kind: "blog", ...parseBlogQuery(url.searchParams.get("category"), url.searchParams.get("page")) };
  const article = /^\/blog\/([^/]+)$/.exec(path);
  if (article) {
    try {
      return { kind: "article", slug: decodeURIComponent(article[1]) };
    } catch {
      return { kind: "missing" };
    }
  }
  if (path === "/unsubscribe") {
    return {
      kind: "unsubscribe",
      status: url.searchParams.get("status"),
      category: url.searchParams.get("category"),
      token: url.searchParams.get("token"),
    };
  }
  const demo = /^\/demo(?:\/([^/]+))?$/.exec(path);
  if (demo) {
    const view = demo[1] ?? null;
    if (view !== null && !isPublicDemoView(view)) return { kind: "missing" };
    const parsed = parseDemoSelection(demoSearchParams(url.searchParams));
    if (!parsed) return { kind: "missing" };
    return { kind: "demo", view: view as PublicDemoView | null, course: parsed.course, search: url.search };
  }
  return null;
}

export interface PublicClient {
  blog(category: BlogCategory | null, page: number, signal?: AbortSignal): Promise<PublicBlogList>;
  article(slug: string, signal?: AbortSignal): Promise<PublicBlogDetail | null>;
  demo(signal?: AbortSignal): Promise<PublicDemoList>;
  demoContent(view: NativeDemoContentView, search: string, signal?: AbortSignal): Promise<PublicDemoContent | null>;
  gradeDemoQuiz(answers: PublicQuizAnswers, signal?: AbortSignal): Promise<PublicQuizResult | null>;
  plans(query: PublicPlansQuery, signal?: AbortSignal): Promise<PublicPlansData>;
  release(signal?: AbortSignal): Promise<{ channel: "stable" | "nightly"; release: PublishedPublicRelease | null }>;
  unsubscribe(token: string, intent: "inspect" | "confirm", signal?: AbortSignal): Promise<EmailNotificationCategory | null>;
}

export function publicExternalUrl(value: string, origin: string, locale: PublicLocale): string {
  const base = new URL(origin);
  const target = new URL(value, base.origin);
  if (target.username || target.password || (target.protocol !== "https:" && target.protocol !== "mailto:" && target.origin !== base.origin)) {
    throw new Error("Unavailable link");
  }
  if (target.origin === base.origin) {
    const path = localizedPublicPath(locale, target.pathname);
    if (path) target.pathname = path;
  }
  return target.toString();
}

export function createPublicClient(origin: string, locale: PublicLocale, transport: typeof fetch = fetch): PublicClient {
  const base = new URL(origin);
  if (base.username || base.password || (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]", "10.0.2.2"].includes(base.hostname)))) {
    throw new Error("Invalid public origin");
  }

  async function request<T>(path: string, signal?: AbortSignal, options?: { body?: object; missing?: number }) {
    const response = await transport(new URL(path, base.origin), {
      method: options?.body ? "POST" : "GET",
      body: options?.body ? JSON.stringify(options.body) : undefined,
      headers: {
        Accept: "application/json",
        "Accept-Language": locale,
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
      },
      credentials: "omit",
      redirect: "error",
      signal,
    });
    if (response.status === options?.missing) return null;
    if (!response.ok) throw new Error("Public request failed");
    return await response.json() as T;
  }

  async function read<T>(path: string, signal?: AbortSignal, body?: object): Promise<T> {
    const data = await request<T>(path, signal, { body });
    if (data === null) throw new Error("Public response was empty");
    return data;
  }

  const channel = base.hostname === "staging.zyxacademy.com" ? "nightly" : "stable";
  return {
    blog: (category, page, signal) => read(blogListHref(category, page).replace("/blog", "/api/native/public/blog"), signal),
    article: (slug, signal) => request(`/api/native/public${blogArticleHref(slug)}`, signal, { missing: 404 }),
    demo: (signal) => read("/api/native/public/demo", signal),
    demoContent: (view, search, signal) => request(`/api/native/public/demo/${view}${search}`, signal, { missing: 404 }),
    gradeDemoQuiz: (answers, signal) => request("/api/demo/quiz", signal, { body: answers, missing: 409 }),
    plans: (query, signal) => read("/api/native/public/plans", signal, { ...query, locale }),
    release: async (signal) => ({ channel, ...await read<{ release: PublishedPublicRelease | null }>(`/api/app/latest?channel=${channel}`, signal) }),
    unsubscribe: async (token, intent, signal) => (await request<{ category: EmailNotificationCategory }>(
      "/api/native/public/unsubscribe", signal, { body: { token, intent }, missing: 404 },
    ))?.category ?? null,
  };
}
