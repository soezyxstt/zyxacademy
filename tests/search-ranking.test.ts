import { describe, expect, it } from "bun:test";
import { rankSearchDocuments } from "@/lib/search/ranking";
import { STATIC_PAGES } from "@/lib/site-search-index";

const quiz = (number: number) => ({
  title: `Kuis Uji UI ${number}`,
  subtitle: "Kalkulus · Kuis",
  keywords: "quiz ujian latihan soal",
  content: `Kuis Uji UI ${number}`,
});

describe("CMDK search ranking", () => {
  it("ranks the matching numbered quiz above semantic neighbors", () => {
    const ranked = rankSearchDocuments("kuis uji 6", [
      quiz(4),
      quiz(9),
      quiz(6),
      quiz(1),
    ]);

    expect(ranked[0].title).toBe("Kuis Uji UI 6");
  });

  it("ranks an exact title above an earlier API result", () => {
    const ranked = rankSearchDocuments("papan peringkat", [
      {
        title: "Analisis papan peringkat",
        subtitle: "Admin",
      },
      {
        title: "Papan peringkat",
        subtitle: "Murid",
      },
    ]);

    expect(ranked[0].title).toBe("Papan peringkat");
  });

  it("keeps the source order when lexical relevance is equal", () => {
    const documents = [
      { title: "Kuis fisika", subtitle: "Course A" },
      { title: "Kuis kimia", subtitle: "Course B" },
    ];

    expect(rankSearchDocuments("kuis", documents)).toEqual(documents);
  });

  it("distinguishes duplicate leaderboard navigation by surface", () => {
    const leaderboards = STATIC_PAGES.filter(
      (document) => document.title === "Papan peringkat"
    );

    expect(leaderboards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: "/leaderboard",
          subtitle: "Murid · Leaderboard",
        }),
        expect.objectContaining({
          href: "/admin/leaderboard",
          subtitle: "Admin · Evaluasi",
        }),
      ])
    );
  });
});
