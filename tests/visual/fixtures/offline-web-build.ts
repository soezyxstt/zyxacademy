import { buildFixture } from "./interactive-document-build";

/** Real library, reader and reading actions; only unrelated remote services are isolated. */
export function buildOfflineWebFixture() {
  const notificationRuntime = `export const ZYX_NOTIFICATIONS_CHANGED='zyx:notifications-changed'; export function NotificationRuntime(){return null;} export function NotificationRuntimeForAccount(){return null;}`;
  return buildFixture("tests/visual/fixtures/offline-web.tsx", "", {
    "@/lib/i18n/actions": `export async function saveLocaleSelection(){return {success:true};} export async function mirrorResolvedAccountLocaleCookie(){return {success:true};}`,
    "@/components/providers/locale-provider": `export {LocaleProvider,useAppLocale} from './components/providers/locale-provider';`,
    "@/lib/auth-client": `const data={user:{id:'fixture-student',name:'Mahasiswa Zyx',email:'student@example.test',role:'student'}}; export const useSession=()=>({data,isPending:false,error:null}); export const authClient={}; export async function signOut(){}`,
    "@/hooks/use-query-account": `export function useSyncQueryAccount(){} export const useQueryAccountId=()=> 'fixture-student'; export const useQueryAccountCurrent=()=>true;`,
    "@/components/student-experience-provider": `export * from './components/student-experience-provider';`,
    "@/components/course/tutor-drawer": `const tutor={isOpen:false,setSuppressPet(){},openTutor(){},openExplain(){},openChatWithQuestion(){}}; export const useTutor=()=>tutor; export const TutorProvider=({children})=>children;`,
    "@/components/command-menu": `const value={setOpen(){},openWithQuery(){}}; export const useCommandMenu=()=>value; export const CommandMenuProvider=({children})=>children;`,
    "@/components/onboarding/guided-tour": `export const GuidedTourProvider=({children})=>children; export const useGuidedTour=()=>null;`,
    "@/components/navigation": `export * from './components/navigation/mobile-chrome-context'; export * from './components/navigation/mobile-top-navbar'; export * from './components/navigation/mobile-bottom-nav';`,
    "@/components/notifications/notification-runtime": notificationRuntime,
    "./notification-runtime": notificationRuntime,
    "@/components/native/app-update-control": `export function AppUpdateControl(){return null;}`,
    "@/lib/auth/account-switch": `export class AccountSwitchError extends Error{}; export const MAX_SAVED_ACCOUNTS=5; export async function listSavedAccounts(){return {accounts:[]};} const unavailable=async()=>{}; export const removeSavedAccount=unavailable,startWebAccountSignIn=unavailable,switchSavedAccount=unavailable;`,
    "@/lib/native/auth": `export class NativeGoogleSignInError extends Error{}; export async function startNativeGoogleSignIn(){}`,
    "@/hooks/use-student-sidebar-data": `export const useStudentSidebarData=()=>({courses:[],streak:null});`,
    "@/lib/discussions/counts-query": `export const discussionCountsQuery=id=>({queryKey:['fixture-discussions',id],queryFn:async()=>({total:{unreadThreads:0}})});`,
    "@/hooks/use-article-reading-progress": `import {useRef} from 'react'; const progress={}; export function useArticleReadingProgress(){return {sectionProgressMap:progress,contentContainerRef:useRef(null),completeRemaining:async()=>{}};}`,
    "@/hooks/use-material-reading-progress": `export function useMaterialReadingProgress(){return {done:false,markDone:async()=>{},markingDone:false};}`,
    "@/app/actions/tutor": `export async function quickExplainSnippetAction(){throw new Error('Tutor is outside this fixture');} export async function findKoForMaterialSectionAction(){return null;}`,
    "@/lib/learning-context-actions": `export async function getConceptPopover(){throw new Error('Concept popover is outside this fixture');}`,
    "@/components/coding/article-coding": `import React from 'react'; export const ArticleCodingProvider=({children})=>children; export const ArticleMarkdownScope=({children})=>children; export const StaticCodeReadingProvider=({children})=>children; export const useArticleMarkdownScope=()=>''; export const useStaticCodeLabels=()=>null; export const ArticleCodeExample=()=>null; export const ArticleCodingExercise=()=>null; export const ScrollableStaticCode=({code})=>React.createElement('pre',null,code);`,
    "next/navigation": `const router={push(){},replace(){},refresh(){window.__offlineWebControls.refreshes++;},back(){}}; export const useRouter=()=>router; export const usePathname=()=>window.location.pathname; export const useSearchParams=()=>new URLSearchParams(window.location.search);`,
  });
}
