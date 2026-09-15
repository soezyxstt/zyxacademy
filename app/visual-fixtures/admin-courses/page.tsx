"use client";

import { CoursesDashboard } from "@/components/admin/courses-dashboard";
import { useEffect, useState } from "react";

const courses = [
  {
    id: "ma1101",
    title: "Matematika I",
    category: "TPB",
    description: "Deskripsi ini tetap tersimpan dan dapat dicari, tetapi tidak ditampilkan pada card.",
    chapterCount: 8,
    materialCount: 14,
    quizCount: 6,
  },
  {
    id: "fi1101",
    title: "Fisika Dasar I",
    category: "TPB",
    description: "Deskripsi kedua juga tidak mengambil ruang pada daftar mata kuliah.",
    chapterCount: 10,
    materialCount: 18,
    quizCount: 9,
  },
];

export default function AdminCoursesVisualFixturePage() {
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  return (
    <main
      id="main-content"
      data-fixture-ready={ready ? "true" : "false"}
      className="min-h-screen bg-background p-4 text-foreground sm:p-6"
    >
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="font-heading text-h5 font-bold">Mata Kuliah</h1>
        <CoursesDashboard initialCourses={courses} />
      </div>
    </main>
  );
}
