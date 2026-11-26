import { buildFixture } from "./interactive-document-build";

/** Real library, reader and reading actions; only unrelated remote services are isolated. */
export function buildOfflineWebFixture() {
  return buildFixture("tests/visual/fixtures/offline-web.tsx", "", {
    "@/lib/i18n/actions": `export async function saveLocaleSelection(){return {success:true};} export async function mirrorResolvedAccountLocaleCookie(){return {success:true};}`,
    "@/components/providers/locale-provider": `export {LocaleProvider,useAppLocale} from './components/providers/locale-provider';`,
    "@/lib/auth-client": `const data={user:{id:'fixture-student',name:'Mahasiswa Zyx',email:'student@example.test'}}; export const useSession=()=>({data,isPending:false,error:null});`,
    "@/hooks/use-query-account": `export function useSyncQueryAccount(){} export const useQueryAccountId=()=> 'fixture-student'; export const useQueryAccountCurrent=()=>true;`,
    "@/components/student-experience-provider": `const value={mode:'full',baseline:[],ready:true,record(){},href:path=>path}; export const useStudentExperience=()=>value;`,
    "@/components/course/tutor-drawer": `const tutor={isOpen:false,setSuppressPet(){},openTutor(){},openExplain(){},openChatWithQuestion(){}}; export const useTutor=()=>tutor;`,
    "@/hooks/use-article-reading-progress": `import {useRef} from 'react'; const progress={}; export function useArticleReadingProgress(){return {sectionProgressMap:progress,contentContainerRef:useRef(null),completeRemaining:async()=>{}};}`,
    "@/hooks/use-material-reading-progress": `export function useMaterialReadingProgress(){return {done:false,markDone:async()=>{},markingDone:false};}`,
    "@/app/actions/tutor": `export async function quickExplainSnippetAction(){throw new Error('Tutor is outside this fixture');} export async function findKoForMaterialSectionAction(){return null;}`,
    "@/lib/learning-context-actions": `export async function getConceptPopover(){throw new Error('Concept popover is outside this fixture');}`,
    "@/components/coding/article-coding": `import React from 'react'; export const ArticleCodingProvider=({children})=>children; export const ArticleMarkdownScope=({children})=>children; export const StaticCodeReadingProvider=({children})=>children; export const useArticleMarkdownScope=()=>''; export const useStaticCodeLabels=()=>null; export const ArticleCodeExample=()=>null; export const ArticleCodingExercise=()=>null; export const ScrollableStaticCode=({code})=>React.createElement('pre',null,code);`,
    "next/navigation": `const router={push(){},replace(){},refresh(){window.__offlineWebControls.refreshes++;},back(){}}; export const useRouter=()=>router; export const usePathname=()=>'/offline'; export const useSearchParams=()=>new URLSearchParams(window.location.search);`,
  });
}
