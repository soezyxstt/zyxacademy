"use client";
import { useMemo } from "react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { TryoutForm, type TryoutPresentationExam } from "@/components/course/tryout-form";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useAppLocale } from "@/lib/i18n/client";
import { syntheticTryout, demoTryoutAnswersKey } from "@/lib/demo/assessment/tryout";
import { useDemoSession } from "../demo-session";
export function DemoTryout({ courseId, exam: suppliedExam }: { courseId: string; exam?: TryoutPresentationExam }) {
 const { locale } = useAppLocale();
 const experience = useStudentExperience();
 const { ready, generation, record } = useDemoSession();
 const revision = experience.baseline.find(item => item.courseId === courseId)?.revision;
 const exam = useMemo(() => suppliedExam ?? syntheticTryout(courseId, locale), [courseId, locale, suppliedExam]);
 if (!ready || !revision || experience.mode !== "demo" || experience.selectedCourseId !== courseId) return null;
 return <CoursePageShell title={exam.title} hideHeader><Reveal><TryoutForm key={`${courseId}:${revision}:${generation}`} courseId={courseId} exam={exam} transport={{
   afterSubmitHref: experience.route("results"),
   submit: async answers => {
     try { sessionStorage.setItem(demoTryoutAnswersKey(courseId, revision), JSON.stringify(answers)); } catch { /* The local submission still completes. */ }
     record("quiz", "fictional-tryout-complete");
   },
 }} /></Reveal></CoursePageShell>;
}
