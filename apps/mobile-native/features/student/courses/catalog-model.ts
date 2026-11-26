import en from "../../../../../messages/en/learning.json";
import id from "../../../../../messages/id/learning.json";
import { PKA_COURSE_ID } from "../../../../../lib/pka-config";
import type { CatalogData, CourseCard } from "../../../../../packages/native-parity/student/courses/contract";

export function catalogGroupId(name: string) {
  return name.toLowerCase().trim().replace(/[^\w\s-]/gu, "").replace(/\s+/gu, "-");
}

export function getCatalogGroups(courses: readonly CourseCard[], query: Readonly<Record<string, string>>) {
  const byCategory = new Map<string, { name: string; id: string; isMajor: boolean; courses: CourseCard[] }>();
  for (const course of courses) {
    const group = byCategory.get(course.category);
    if (group) group.courses.push(course);
    else byCategory.set(course.category, {
      name: course.category, id: catalogGroupId(course.category), isMajor: course.priority === true, courses: [course],
    });
  }
  const groups = Array.from(byCategory.values());
  const active = groups.find(group => query.category ? group.name === query.category : group.id === query.jurusan)?.id ?? "all";
  const term = query.q?.trim().toLocaleLowerCase();
  const visible = groups.filter(group => active === "all" || group.id === active).map(group => ({
    ...group,
    courses: term ? group.courses.filter(course =>
      [course.title, course.description, course.category].some(text => text.toLocaleLowerCase().includes(term))) : group.courses,
  })).filter(group => group.courses.length > 0);
  return { groups, active, visible, hasSearch: Boolean(term) };
}

const englishCounts = { course: ["course", "courses"], material: ["material", "materials"], quiz: ["quiz", "quizzes"], tryout: ["tryout", "tryouts"] };
const indonesianCounts = { course: "mata kuliah", material: "materi", quiz: "kuis", tryout: "tryout" };

export function catalogCopy(locale: string) {
  const english = locale.startsWith("en");
  const messages = english ? en : id;
  const number = new Intl.NumberFormat(locale);
  return {
    catalog: messages.catalog,
    row: messages.courseCatalog,
    all: (count: number) => messages.courseCatalog.all.replace("{count}", number.format(count)),
    count: (count: number, unit: keyof typeof englishCounts) => {
      const label = english ? englishCounts[unit][count === 1 ? 0 : 1] : indonesianCounts[unit];
      return `${number.format(count)} ${label}`;
    },
  };
}

export function getCatalogBadge(course: Pick<CourseCard, "id" | "title">) {
  if (course.id === PKA_COURSE_ID) return { initials: "PKA", tone: "pka" } as const;
  const title = course.title.toLowerCase();
  if (/matematika|kalkulus/u.test(title)) return { initials: title.includes("matematika lanjut") ? "ML" : "MA", tone: "math" } as const;
  if (title.includes("fisika")) return { initials: "FI", tone: "physics" } as const;
  if (title.includes("kimia")) return { initials: "KI", tone: "chemistry" } as const;
  if (/komputasi|komputer|informatika/u.test(title)) return { initials: "BK", tone: "computing" } as const;
  const initials = course.title.trim().split(/\s+/u).slice(0, 2).map(word => word[0]?.toUpperCase()).join("") || "MK";
  return { initials, tone: "default" } as const;
}

export function getCatalogRow(course: CourseCard, copy: ReturnType<typeof catalogCopy>) {
  const isPka = course.id === PKA_COURSE_ID;
  const hasTimedOffer = !isPka && course.pricing?.category === "limited_time_free";
  const counts = [
    [course.materialsCount, "material"], [course.quizzesCount, "quiz"], [course.tryoutsCount, "tryout"],
  ] as const;
  const figures = counts.flatMap(([count, unit]) => count && count > 0 ? [copy.count(count, unit)] : []);
  return {
    badge: getCatalogBadge(course),
    hasContent: isPka || figures.length > 0,
    summary: isPka ? copy.row.pkaSummary : figures.join(" · ") || copy.row.noContent,
    lockedLabel: !course.hasFullContentAccess && !hasTimedOffer
      ? isPka ? copy.row.registrationRequired : copy.row.limitedAccess : null,
  };
}

export function getCatalogOfferWindow(course: CourseCard) {
  const pricing = course.pricing;
  if (course.id === PKA_COURSE_ID || pricing?.category !== "limited_time_free" || !pricing.startsAt || !pricing.endsAt) return null;
  const start = new Date(pricing.startsAt);
  const end = new Date(pricing.endsAt);
  return start < end ? { start, end } : null;
}

export function getCatalogOffer(window: NonNullable<ReturnType<typeof getCatalogOfferWindow>>, locale: string, now: Date) {
  const { start, end } = window;
  const state = now < start ? "offerUpcoming" : now >= end ? "offerEnded" : "offerActive";
  const date = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const startClock = clock.format(start);
  const endClock = clock.format(end);
  if (startClock !== endClock) return { state, schedule: `${date.format(start)} ${startClock} - ${date.format(end)} ${endClock} WIB` } as const;

  const startParts = Object.fromEntries(date.formatToParts(start).map(part => [part.type, part.value]));
  const endParts = Object.fromEntries(date.formatToParts(end).map(part => [part.type, part.value]));
  const sameYear = startParts.year === endParts.year;
  const sameMonth = sameYear && startParts.month === endParts.month;
  if (sameMonth && startParts.day === endParts.day) return { state, schedule: `${date.format(end)} (${startClock} WIB)` } as const;
  const from = sameMonth ? startParts.day : sameYear ? `${startParts.day} ${startParts.month} ` : `${date.format(start)} `;
  const range = `${from}-${sameMonth ? "" : " "}${date.format(end)}`;
  return { state, schedule: `${range} (${startClock} WIB)` } as const;
}

export function nextCatalogOfferChange(data: CatalogData, now: number) {
  const upcoming = data.courses.flatMap(course => {
    const window = getCatalogOfferWindow(course);
    return window ? [window.start.getTime(), window.end.getTime()].filter(time => time > now) : [];
  });
  return upcoming.length > 0 ? Math.min(...upcoming) : null;
}
