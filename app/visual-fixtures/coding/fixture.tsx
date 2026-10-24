"use client";
import { TutorLiveConsole } from "@/components/tutor/tutor-live-console";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArticleParts } from "@/components/course/article-parts";
import { ArticleCodingProvider } from "@/components/coding/article-coding";
import { CodingWorkspace } from "@/components/coding/coding-workspace";
import { LiveCodingExercise } from "@/components/coding/live-coding-exercise";

export function CodingFixture() {
  const [closed, setClosed] = useState(false);
  return <main className="mx-auto w-full max-w-4xl space-y-5 p-4 text-foreground">
    <h1 className="font-heading text-h5">Berpikir komputasi</h1>
    <Tabs defaultValue="playground">
      <TabsList><TabsTrigger value="article">Artikel</TabsTrigger><TabsTrigger value="playground">Playground</TabsTrigger><TabsTrigger value="live">Live Quiz</TabsTrigger><TabsTrigger value="host">Tutor</TabsTrigger></TabsList>
      <TabsContent value="playground"><CodingWorkspace courseId="coding-course" learnerId="coding-student" draftKey="playground" initialCode={'nama = input("Nama: ")\nprint("Halo,", nama)'} /></TabsContent>
      <TabsContent value="article"><ArticleCodingProvider value={{ courseId: "coding-course", articleId: "coding-article", articleVersion: 1, enabled: true }}><ArticleParts parts={[
        { id: "intro", kind: "markdown", markdown: "## Batas perulangan\nPerhatikan apakah batas akhir ikut diproses oleh `range`. Prediksi hasilnya sebelum menjalankan." },
        { id: "static", kind: "code_example", language: "python", code: "for angka in range(1, 4):\n    print(angka)", runnable: false },
        { id: "example", kind: "code_example", language: "python", code: "total = 0\nfor angka in range(1, 6):\n    total += angka\nprint(total)", runnable: true },
        { id: "exercise", kind: "coding_exercise", problem: { problemId: "sum-even", version: 1 } },
      ]} /></ArticleCodingProvider></TabsContent>
      <TabsContent value="host"><TutorLiveConsole courseId="coding-course" courseTitle="Berpikir komputasi" /></TabsContent>
      <TabsContent value="live"><div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-heading text-body-base font-bold">Soal 1</h2><Button className="text-body-sm" variant="outline" onClick={() => setClosed(!closed)}>{closed ? "Buka soal" : "Tutup soal"}</Button></div><LiveCodingExercise courseId="coding-course" sessionId="coding-session" questionIndex={0} coding={{ problemId: "sum-even", version: 1, maxAttempts: null, assistance: "hints", scoring: "best", durationSeconds: 300 }} closed={closed} /></div></TabsContent>
    </Tabs>
  </main>;
}
