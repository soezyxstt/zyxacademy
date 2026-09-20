"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardList, Layers } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { studentInteractiveCardClass } from "@/components/course/course-surfaces";
import { PKA_COURSE_ID } from "@/lib/pka-config";

export interface CatalogCourseItem {
  id: string;
  title: string;
  category: string;
  description: string;
  materialsCount: number;
  quizzesCount: number;
  tryoutsCount: number;
}

export interface CourseGroup {
  jurusan: string;
  isStudentMajor: boolean;
  courses: CatalogCourseItem[];
}

interface CourseCatalogClientProps {
  groups: CourseGroup[];
  studentTargetCategory?: string | null;
}

function slugifyJurusan(jurusan: string): string {
  return jurusan
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function CourseCatalogClient({
  groups,
  studentTargetCategory,
}: CourseCatalogClientProps) {
  const totalCourses = groups.reduce((acc, g) => acc + g.courses.length, 0);

  const renderCard = (c: CatalogCourseItem) => {
    const isPka = c.id === PKA_COURSE_ID;
    return (
      <Link
        key={c.id}
        href={`/courses/${c.id}`}
        className={studentInteractiveCardClass("justify-between p-5")}
      >
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20">
                {c.category}
              </span>
              {isPka ? (
                <span className="rounded-md bg-brand-secondary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-secondary ring-1 ring-brand-secondary/20">
                  Maba ITB
                </span>
              ) : (
                <span className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  ITB TPB
                </span>
              )}
            </div>
            <span className="flex size-7 items-center justify-center rounded-lg border border-border/60 bg-background/50 text-muted-foreground transition-all duration-200 group-hover:border-brand-primary/30 group-hover:bg-brand-primary/10 group-hover:text-brand-primary shrink-0">
              <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </div>

          <h3 className="mt-3.5 font-heading text-body-base font-bold text-foreground transition-colors group-hover:text-brand-primary">
            {c.title}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-body-xs leading-relaxed text-muted-foreground">
            {c.description || "Kelas persiapan dan modul terstruktur ITB TPB."}
          </p>
        </div>

        <div className="mt-5 border-t border-border/50 pt-3.5 text-body-xs text-muted-foreground">
          {isPka ? (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-brand-secondary font-medium">
                <Layers className="size-3.5" />
                Simulasi 3 stage x 3 mapel
              </span>
              <span className="font-semibold text-brand-primary">Mulai</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5">
                <BookOpen className="size-3.5 text-brand-primary shrink-0" />
                <span>{c.materialsCount} materi</span>
              </span>
              <span className="flex items-center gap-1.5">
                <ClipboardList className="size-3.5 text-tertiary-1 shrink-0" />
                <span>{c.quizzesCount} kuis, {c.tryoutsCount} tryout</span>
              </span>
            </div>
          )}
        </div>
      </Link>
    );
  };

  const renderSection = (group: CourseGroup) => (
    <section key={group.jurusan} className="space-y-3">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-body-base font-bold text-foreground">
            {group.jurusan}
          </h2>
          {group.isStudentMajor && (
            <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-2xs font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20">
              Jurusan Anda
            </span>
          )}
        </div>
        <span className="text-body-xs text-muted-foreground font-medium">
          {group.courses.length} mata kuliah
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {group.courses.map(renderCard)}
      </div>
    </section>
  );

  if (groups.length <= 1) {
    return (
      <div className="space-y-8">
        {groups.map(renderSection)}
      </div>
    );
  }

  return (
    <Tabs defaultValue="all" paramKey="jurusan" className="w-full space-y-6">
      <TabsList aria-label="Filter jurusan course">
        <TabsTrigger value="all">
          Semua ({totalCourses})
        </TabsTrigger>
        {groups.map((group) => {
          const tabSlug = slugifyJurusan(group.jurusan);
          return (
            <TabsTrigger key={group.jurusan} value={tabSlug} className="gap-1.5">
              <span>{group.jurusan}</span>
              <span className="text-muted-foreground/80 font-normal">({group.courses.length})</span>
              {group.isStudentMajor && (
                <span className="size-1.5 rounded-full bg-brand-primary shrink-0" title="Jurusan Anda" />
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value="all" className="space-y-8 mt-0">
        {groups.map(renderSection)}
      </TabsContent>

      {groups.map((group) => {
        const tabSlug = slugifyJurusan(group.jurusan);
        return (
          <TabsContent key={group.jurusan} value={tabSlug} className="space-y-8 mt-0">
            {renderSection(group)}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
