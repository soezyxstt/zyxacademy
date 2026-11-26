import {
  blogCategories, blogCategoryPreviewCount, blogFeaturedCount, blogPageSize,
  type PublicBlogCard, type PublicBlogDetail, type PublicClient, type PublicLocale, type PublicTheme,
} from "./public-contract";

const baseCard: PublicBlogCard = {
  slug: "belajar-dengan-latihan-terarah",
  title: "Belajar dengan latihan terarah",
  summary: "Gunakan latihan singkat untuk mengecek pemahaman setelah membaca materi kuliah.",
  category: "tips_kuliah",
  thumbnailUrl: null,
  publishedAt: "2026-11-18T03:00:00.000Z",
  readMinutes: 4,
};

export const publicBlogFixture: PublicBlogCard[] = [
  baseCard,
  { ...baseCard, slug: "kenali-perpustakaan-kampus", title: "Kenali perpustakaan kampus", summary: "Tempat untuk membaca, berdiskusi, dan menemukan referensi kuliah.", category: "pojok_kampus", publishedAt: "2026-11-17T03:00:00.000Z", readMinutes: 3 },
  { ...baseCard, slug: "mengapa-kita-lupa", title: "Mengapa kita lupa?", summary: "Kenali cara ingatan berubah setelah belajar.", category: "fakta_seru", publishedAt: "2026-11-16T03:00:00.000Z", readMinutes: 5 },
  ...Array.from({ length: 13 }, (_, index): PublicBlogCard => ({
    ...baseCard,
    slug: `latihan-terarah-${index + 2}`,
    title: `Latihan terarah ${index + 2}`,
    publishedAt: new Date(Date.UTC(2026, 10, 15 - index, 3)).toISOString(),
  })),
];

export const publicArticleFixture: PublicBlogDetail["article"] = {
  ...baseCard,
  author: "Zyx Academy",
  content: "Latihan singkat membantu kita menemukan bagian materi yang perlu diulang.\n\n## Mulai dari satu konsep\n\nBaca satu bagian, tutup catatan, lalu tulis langkah penyelesaiannya.\n\n- Tandai langkah yang belum yakin.\n- Baca kembali penjelasannya.\n\n**Coba lagi** dengan soal yang memakai konsep serupa.",
};

export type PublicScenario = "populated" | "empty" | "recoverable";

type PublicCase = {
  id: string;
  pattern: string;
  component: string;
  href: string;
  locale: PublicLocale;
  theme: PublicTheme;
  scenario: PublicScenario;
  steps: readonly string[];
};

const caseGroups = [
  {
    pattern: "/", component: "Landing", cases: [
      ["hero-id", "/", "id", "light", "populated", ["Open the landing page and check the free and demo links"]],
      ["english-faq", "/", "en", "dark", "populated", ["Expand the Free access question", "Collapse it"]],
      ["demo-link", "/", "id", "dark", "populated", ["Open Coba demo", "Return to the landing page"]],
    ],
  },
  {
    pattern: "/about", component: "About", cases: [
      ["founders-id", "/about", "id", "light", "populated", ["Scroll to the founders and check names"]],
      ["long-copy-en", "/about", "en", "dark", "populated", ["Read the story and working principles at a narrow width"]],
      ["portfolio", "/about", "id", "dark", "populated", ["Activate the founder portfolio link"]],
    ],
  },
  {
    pattern: "/blog", component: "BlogList", cases: [
      ["blog-list-open-back", "/blog", "id", "light", "populated", ["Open Belajar dengan latihan terarah", "Tap Kembali ke Blog"]],
      ["blog-list-empty", "/blog?category=kegiatan_zyx", "en", "dark", "empty", ["Check the empty category", "Select All"]],
      ["blog-list-retry", "/blog?category=tips_kuliah", "id", "light", "recoverable", ["Tap Coba lagi", "Open the next category page"]],
    ],
  },
  {
    pattern: "/blog/[slug]", component: "BlogArticle", cases: [
      ["blog-detail-content", `/blog/${baseCard.slug}`, "id", "light", "populated", ["Read the article", "Tap a related article", "Return"]],
      ["blog-detail-missing", "/blog/artikel-tidak-tersedia", "en", "dark", "empty", ["Check the not found state", "Tap Back to Blog"]],
      ["blog-detail-retry", `/blog/${baseCard.slug}`, "id", "light", "recoverable", ["Tap Coba lagi", "Read author and date"]],
    ],
  },
  {
    pattern: "/demo", component: "Demo", cases: [
      ["demo-course-article", "/demo", "id", "light", "populated", ["Open the first course article"]],
      ["demo-empty", "/demo", "en", "dark", "empty", ["Check the empty message and signup action"]],
      ["demo-retry", "/demo", "id", "dark", "recoverable", ["Tap Coba lagi", "Check the selected course"]],
    ],
  },
  {
    pattern: "/demo/[view]", component: "NativeDemoContent", cases: [
      ["demo-view-article", "/demo/article?course=demo-kalkulus&articleId=demo-integral", "id", "light", "populated", ["Read the first section", "Return to that course in the demo"]],
      ["demo-view-missing", "/demo/flashcards?course=unknown", "en", "dark", "populated", ["Check the missing course state", "Return to demo"]],
      ["demo-view-quiz", "/demo/quiz?course=demo-kalkulus", "en", "dark", "populated", ["Choose answer 4", "Submit and check the result"]],
    ],
  },
  {
    pattern: "/download", component: "Download", cases: [
      ["download-platforms", "/download", "id", "light", "populated", ["Check available Android and disabled iPhone"]],
      ["download-empty", "/download", "en", "dark", "empty", ["Check no Stable release and disabled platform buttons"]],
      ["download-retry", "/download", "id", "dark", "recoverable", ["Tap Coba lagi and verify the Android download becomes available"]],
    ],
  },
  {
    pattern: "/forms-playground", component: "FormsPlayground", cases: [
      ["form-empty", "/forms-playground", "en", "light", "populated", ["Verify default input, picker and agreement state"]],
      ["form-validation", "/forms-playground", "en", "dark", "populated", ["Submit without entering values", "Check each required field"]],
      ["form-local-submit", "/forms-playground", "en", "dark", "populated", ["Fill valid values, select a course and fixture file, and agree", "Submit and check the reset"]],
    ],
  },
  {
    pattern: "/plans", component: "Plans", cases: [
      ["plans-default", "/plans", "id", "light", "populated", ["Verify three people and three courses", "Check price per person and per semester"]],
      ["plans-course-limits", "/plans", "en", "dark", "populated", ["Expand course choices", "Decrease to one course and check the disabled decrement"]],
      ["plans-retry", "/plans", "id", "dark", "recoverable", ["Tap Coba lagi", "Increase the people count and check updated totals"]],
    ],
  },
  {
    pattern: "/privacy", component: "Legal", cases: [
      ["privacy-id", "/privacy", "id", "light", "populated", ["Check the updated date and policy copy"]],
      ["privacy-en-anchor", "/privacy", "en", "dark", "populated", ["Tap the last table of contents item", "Check the contact email"]],
      ["privacy-terms-link", "/privacy", "id", "dark", "populated", ["Open the Terms link inside the policy"]],
    ],
  },
  {
    pattern: "/terms", component: "Legal", cases: [
      ["terms-id", "/terms", "id", "light", "populated", ["Check the updated date and terms copy"]],
      ["terms-en-anchor", "/terms", "en", "dark", "populated", ["Open a table of contents item", "Check the section heading"]],
      ["terms-privacy-link", "/terms", "id", "dark", "populated", ["Open the Privacy Policy link inside the terms"]],
    ],
  },
  {
    pattern: "/testimonial", component: "Testimonial", cases: [
      ["testimonial-list", "/testimonial", "id", "light", "populated", ["Check all three stories and student names"]],
      ["testimonial-dark-en", "/testimonial", "en", "dark", "populated", ["Scroll through the long unmodified source quotes"]],
      ["testimonial-plans", "/testimonial", "id", "dark", "populated", ["Open the plans from the bottom call to action"]],
    ],
  },
  {
    pattern: "/unsubscribe", component: "Unsubscribe", cases: [
      ["unsubscribe-confirm", "/unsubscribe?token=fixture-course-updates", "id", "light", "populated", ["Confirm the course update preference", "Check the success state"]],
      ["unsubscribe-invalid", "/unsubscribe?token=invalid", "en", "dark", "populated", ["Check the invalid link copy", "Check the manage preferences action"]],
      ["unsubscribe-retry", "/unsubscribe?token=fixture-course-updates", "id", "dark", "recoverable", ["Retry inspection", "Confirm and retry the synthetic failure"]],
    ],
  },
] as const;

export const publicCases: readonly PublicCase[] = caseGroups.flatMap(({ pattern, component, cases }) =>
  cases.map(([id, href, locale, theme, scenario, steps]) => ({
    id: `operations-public-${id}`,
    pattern, component, href, locale, theme, scenario, steps,
  })),
);

export function createFixturePublicClient(scenario: PublicScenario = "populated"): PublicClient {
  const attempted = new Set<string>();
  function before(resource: string, signal?: AbortSignal) {
    if (signal?.aborted) throw new Error("Aborted");
    if (scenario === "recoverable" && !attempted.has(resource)) {
      attempted.add(resource);
      throw new Error("Synthetic signal");
    }
  }

  const entries = scenario === "empty" ? [] : publicBlogFixture;

  return {
    async blog(category, page, signal) {
      before("blog", signal);
      if (category) {
        const matches = entries.filter((card) => card.category === category);
        const offset = (page - 1) * blogPageSize;
        return { total: matches.length, articles: matches.slice(offset, offset + blogPageSize), sections: [] };
      }
      const articles = entries.slice(0, blogFeaturedCount);
      const sections = blogCategories.flatMap(({ id }) => {
        const cards = entries.filter((card) => card.category === id && !articles.includes(card)).slice(0, blogCategoryPreviewCount);
        return cards.length ? [{ category: id, entries: cards }] : [];
      });
      return { total: entries.length, articles, sections };
    },
    async article(slug, signal) {
      before("article", signal);
      const card = entries.find((item) => item.slug === slug);
      return card ? {
        article: { ...card, author: publicArticleFixture.author, content: slug === baseCard.slug ? publicArticleFixture.content : card.summary },
        related: entries.filter((item) => item.slug !== slug).slice(0, 5),
      } : null;
    },
    async demo(signal) {
      before("demo", signal);
      return { showLive: false, courses: scenario === "empty" ? [] : [{
        id: "demo-kalkulus",
        title: "Kalkulus IA",
        description: "Pelajari integral tentu dan cara menggunakannya.",
        chapterTitle: "Integral tentu",
        article: { id: "demo-integral", title: "Menghitung integral tentu" },
      }] };
    },
    async demoContent(view, search, signal) {
      before("demo-content", signal);
      const params = new URLSearchParams(search);
      if (scenario === "empty" || (params.has("course") && params.get("course") !== "demo-kalkulus")) return null;
      switch (view) {
        case "overview": return { kind: view, chapters: [{ id: "integral", orderIndex: 1, title: "Integral tentu" }] };
        case "documents": return { kind: view, documents: [{ kind: "article", id: "demo-integral", title: "Menghitung integral tentu", collectionOffset: 0 }] };
        case "article": return { kind: view, title: "Menghitung integral tentu", minutes: 4, sections: [{
          id: "integral", title: "Integral tentu", objective: "Hitung luas dengan mengevaluasi batas.",
          blocks: [{ id: "batas", title: "Evaluasi batas", text: "Kurangi nilai antiturunan di batas bawah dari batas atas." }],
        }] };
        case "diktat": return { kind: view, title: "Latihan integral tentu", sections: [{ title: "Soal", content: "Hitung luas persegi dengan panjang sisi 4." }] };
        case "flashcards": return { kind: view, offset: 0, nextOffset: null, cards: [{
          front: "Apa yang diwakili integral tentu?", back: "Luas bertanda di bawah kurva.", explanation: null,
        }] };
        case "quiz-list":
        case "quiz-start":
        case "quiz":
          return { kind: view, courseId: "demo-kalkulus", offset: 0, nextOffset: null, previousOffset: null, total: 1,
            token: view === "quiz" ? "fixture-token" : "", questions: view === "quiz" ? [{
              id: "demo-question", prompt: "Apa hasil dari 2 + 2?", options: ["3", "4", "5"], multiple: false,
            }] : [] };
      }
    },
    async gradeDemoQuiz(answers, signal) {
      before("demo-grade", signal);
      if (answers.questionSetToken !== "fixture-token" || answers.questionIds.join(",") !== "demo-question") return null;
      const correct = answers.answers[0]?.[0] === 1;
      return { score: Number(correct), total: 1, results: [{ index: 0, isCorrect: correct, correctIndices: [1], explanation: "Dua ditambah dua sama dengan empat." }] };
    },
    async plans({ people, subjects, otherSubjects }, signal) {
      before("plans", signal);
      const unit = (subjects.length + otherSubjects) * people;
      return { quotes: [
        { key: "minimal", price: 155000 * unit, regularPrice: 155000 * unit, discountPercent: 0, isIntroductory: false, contactUrl: null },
        { key: "essential", price: 500000 * unit, regularPrice: 500000 * unit, discountPercent: 0, isIntroductory: false, contactUrl: null },
        { key: "premium", price: 925000 * unit, regularPrice: 925000 * unit, discountPercent: 0, isIntroductory: false, contactUrl: null },
        { key: "free", price: 0, regularPrice: 0, discountPercent: 0, isIntroductory: false, contactUrl: null },
        { key: "custom", price: 0, regularPrice: 0, discountPercent: 0, isIntroductory: false, contactUrl: null },
      ] };
    },
    async release(signal) {
      before("release", signal);
      return {
        channel: "stable",
        release: scenario === "empty" ? null : {
          version: "0.0.0", buildId: null, releaseUrl: "https://example.test/release",
          downloads: { android: "https://example.test/release/zyx.apk", windows: null, linuxDeb: null, linuxAppImage: null },
        },
      };
    },
    async unsubscribe(token, intent, signal) {
      before(`unsubscribe-${intent}`, signal);
      return scenario !== "empty" && token === "fixture-course-updates" ? "course_updates" : null;
    },
  };
}
