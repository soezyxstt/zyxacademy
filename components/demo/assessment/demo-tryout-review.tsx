"use client";
import { useEffect, useMemo, useState } from "react";
import { StudentSubmissionReviewView } from "@/components/course/student-submission-review-view";
import type { AnswerState } from "@/components/course/tryout-form";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useAppLocale } from "@/lib/i18n/client";
import { syntheticTryout, demoTryoutAnswersKey, parseDemoTryoutAnswers } from "@/lib/demo/assessment/tryout";
export function DemoTryoutReview({ courseId }: { courseId: string }) {
 const experience = useStudentExperience();
 const { locale } = useAppLocale();
 const snapshot = experience.baseline.find(item => item.courseId === courseId);
 const exam = useMemo(() => syntheticTryout(courseId, locale), [courseId, locale]);
 const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
 useEffect(() => { try { setAnswers(parseDemoTryoutAnswers(localStorage.getItem(demoTryoutAnswersKey(courseId, snapshot?.revision ?? "")), exam)); } catch { setAnswers({}); } }, [courseId, snapshot?.revision, exam]);
 return <StudentSubmissionReviewView courseId={courseId} backHref={experience.route("results")} listItem={{ id: "fictional-local-tryout", courseId, examId: exam.id, examTitle: exam.title, examType: "tryout", status: "pending_review", score: null, submittedAt: snapshot?.asOf ?? "2026-06-30" }} review={{ id: "fictional-local-tryout", courseId, examId: exam.id, examTitle: exam.title, examType: "tryout", items: exam.questions.map(question => {
   const answer = answers[question.id];
   const userAnswer = answer?.type === "short_answer" || answer?.type === "essay" ? answer.text : answer?.type === "multiple_choice" && answer.index !== null && "options" in question ? question.options[answer.index] ?? "" : answer?.type === "multiple_choices" && "options" in question ? answer.indices.map(index => question.options[index]).filter(Boolean).join("; ") : "";
   return { questionId: question.id, prompt: question.prompt, questionType: question.type, userAnswer, correct: null };
 }) }} />;
}
