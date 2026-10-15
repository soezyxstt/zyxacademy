import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WatchlistTable } from "@/components/tutor/watchlist-table";

describe("compact tutor watchlist", () => {
  test("keeps student identity, intervention count, and activity in semantic table cells", () => {
    const markup = renderToStaticMarkup(
      <WatchlistTable students={[
        { studentId: "one", name: "Siswa Satu", decliningConcepts: ["Limit", "Turunan", "Integral", "Vektor"], activeInterventionCount: 0, lastActiveAt: null },
        { studentId: "two", name: "Siswa Dua", decliningConcepts: [], activeInterventionCount: 2, lastActiveAt: null },
      ]} />,
    );

    expect(markup).toContain("<table");
    expect(markup).toContain("<thead");
    expect(markup).toContain("<tbody");
    expect(markup).toContain("Siswa Satu");
    expect(markup).toContain("Limit, Turunan, Integral +1");
    expect(markup).toContain("Siswa Dua");
    expect(markup).toContain("2 intervensi aktif");
    expect(markup).toContain("Belum pernah");
  });

  test("renders a meaningful empty state without an empty table", () => {
    const markup = renderToStaticMarkup(<WatchlistTable students={[]} />);
    expect(markup).toContain("Tidak ada siswa perlu perhatian");
    expect(markup).not.toContain("<table");
  });
});
