"use client";

import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
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
  {
    id: "ki1101",
    title: "Kimia Dasar dan Praktikum Laboratorium",
    category: "TPB",
    chapterCount: 0,
    materialCount: 0,
    quizCount: 0,
  },
];

export default function AdminCoursesVisualFixturePage() {
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  return (
    <main
      id="main-content"
      data-fixture-ready={ready ? "true" : "false"}
      className="min-h-screen bg-background text-foreground"
    >
      <ApplicationPage>
        <PageHeader title="Mata Kuliah" />
        <CoursesDashboard initialCourses={courses} />
      </ApplicationPage>
    </main>
  );
}
