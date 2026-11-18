import { buildFixture } from "./interactive-document-build";

/** Real feature views/controllers with isolated transport and unrelated heavy tools. */
export function buildLearningFixture() {
  return buildFixture("tests/visual/fixtures/learning-query.tsx", "", {
    "@/components/student-experience-provider": `export const useStudentExperience=()=>({mode:window.learningFixture?.demo?'demo':'full',baseline:[],ready:true,record(){},href:path=>path});`,
    "@/components/course/tutor-drawer": `const tutor={isOpen:false,setSuppressPet(){},openTutor(){},openExplain(){},openChatWithQuestion(){}}; export const useTutor=()=>tutor;`,
    "next/navigation": `import React from 'react'; const router={push(){},replace(){},refresh(){},back(){}}; export const useRouter=()=>router; export const usePathname=()=>'/fixture'; export const useSearchParams=()=>React.useMemo(()=>new URLSearchParams(window.location.search),[window.location.search]);`,
    "@/app/actions/tutor": `export async function quickExplainSnippetAction(){throw new Error('Tutor requests are outside this fixture');} export async function findKoForMaterialSectionAction(){return null;}`,
    "@/lib/learning-context-actions": `export async function getConceptPopover(){throw new Error('Concept popovers are outside this fixture');}`,
    "@/app/(student)/dashboard/actions": `export async function updateMaterialProgress(materialId,status,expectedUserId){const response=await fetch('/fixture/material-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({materialId,status,expectedUserId})});if(!response.ok)throw new Error('Status failed');return response.json();}`,
    "@/app/(student)/courses/[id]/flashcard/actions": `export async function submitReviewAction(studentId,flashcardId,grade,manualAnswer,isExamMode,courseId){const response=await fetch('/fixture/flashcard-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId,flashcardId,grade,manualAnswer,isExamMode,courseId})});if(!response.ok)throw new Error('Review failed');const result=await response.json();if(result.nextReviewDue)result.nextReviewDue=new Date(result.nextReviewDue);return result;}`,
    "@/components/coding/article-coding": `import React from 'react'; export const ArticleCodingProvider=({children})=>children;export const ArticleMarkdownScope=({children})=>children;export const StaticCodeReadingProvider=({children})=>children;export const useArticleMarkdownScope=()=>'';export const useStaticCodeLabels=()=>null;export const ArticleCodeExample=()=>null;export const ArticleCodingExercise=()=>null;export const ScrollableStaticCode=({code})=>React.createElement('pre',null,code);`,
  });
}
