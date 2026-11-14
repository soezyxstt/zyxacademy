import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { RecentActivityCard } from "@/components/course/recent-activity-card";
import studentCourse from "@/messages/id/studentCourse.json";
import englishCourse from "@/messages/en/studentCourse.json";

describe("recent activity presentation", () => {
  test("keeps event details while omitting a generic title when details are available", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="id" timeZone="UTC" messages={{ studentCourse }}>
        <RecentActivityCard data={[
          { id: "1", type: "flashcard_review", title: "Aktivitas belajar", description: "Limit fungsi", timestamp: "2026-01-01T00:00:00Z" },
          { id: "2", type: "quiz_completion", title: "Menjawab kuis", description: "Turunan", timestamp: "2026-01-01T00:00:00Z" },
          { id: "3", type: "flashcard_review", title: "Aktivitas belajar", timestamp: "2026-01-01T00:00:00Z" },
        ]} />
      </NextIntlClientProvider>,
    );
    expect(html.match(/Aktivitas belajar/g)).toHaveLength(1);
    expect(html).toContain("Limit fungsi");
    expect(html).toContain("Menjawab kuis");
    expect(html).toContain("Turunan");
  });
  test("localizes known event labels while preserving meaningful titles", () => {
    const html = renderToStaticMarkup(<NextIntlClientProvider locale="en" timeZone="UTC" messages={{studentCourse:englishCourse}}><RecentActivityCard data={[
      {id:"1",type:"material_completion",title:"Menyelesaikan dokumen",timestamp:"2026-01-01T00:00:00Z"},
      {id:"2",type:"quiz_completion",title:"Menjawab kuis",timestamp:"2026-01-01T00:00:00Z"},
      {id:"3",type:"flashcard_review",title:"Learning activity",description:"Limit functions",timestamp:"2026-01-01T00:00:00Z"},
      {id:"4",type:"flashcard_review",title:"Integral methods",timestamp:"2026-01-01T00:00:00Z"},
    ]}/></NextIntlClientProvider>);
    expect(html).toContain("Document completed");
    expect(html).toContain("Quiz answered");
    expect(html).toContain("Limit functions");
    expect(html).toContain("Integral methods");
    expect(html).not.toContain("Learning activity");
  });
});
