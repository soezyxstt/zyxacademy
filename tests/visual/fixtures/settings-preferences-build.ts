import { buildFixture } from "./interactive-document-build";

/** Real settings and application chrome. Only transport and unrelated runtime work are isolated. */
export function buildSettingsPreferencesFixture() {
  const notificationRuntime = `export const ZYX_NOTIFICATIONS_CHANGED='zyx:notifications-changed'; export function NotificationRuntime(){return null;} export function NotificationRuntimeForAccount(){return null;}`;
  return buildFixture("tests/visual/fixtures/settings-preferences.tsx", "", {
    "./actions": `export async function updateNotificationPreferencesAction(){throw new Error('Saving server preferences is outside this visual fixture');} export async function updateActivityNotificationPreferenceAction(){return {success:true};} export async function updateTutorialEmailScheduleAction(){return {success:true};}`,
    "@/lib/i18n/actions": `export async function saveLocaleSelection(){return {success:true};} export async function mirrorResolvedAccountLocaleCookie(){return {success:true};}`,
    "@/components/providers/locale-provider": `export {LocaleProvider,useAppLocale} from './components/providers/locale-provider';`,
    "@/components/student-experience-provider": `export {StudentExperienceProvider,useStudentExperience} from './components/student-experience-provider';`,
    "@/lib/auth-client": `const data={user:{id:'fixture-student',name:'Pelajar',email:'pelajar@example.test',role:'murid'}}; export const useSession=()=>({data,isPending:false}); export async function signOut(){throw new Error('Sign out is outside this fixture');} export const authClient={};`,
    "@/components/command-menu": `const value={setOpen(){},openWithQuery(){}}; export const CommandMenuProvider=({children})=>children; export const useCommandMenu=()=>value;`,
    "@/components/course/tutor-drawer": `const value={setSuppressPet(){},openTutor(){}}; export const TutorProvider=({children})=>children; export const useTutor=()=>value;`,
    "@/hooks/use-student-sidebar-data": `const data={courses:[],activeCourse:undefined,streak:null,weeklyActivity:[]}; export const useStudentSidebarData=()=>data;`,
    "@/hooks/use-query-account": `export function useSyncQueryAccount(){} export const useQueryAccountId=()=>undefined; export const useQueryAccountCurrent=()=>true;`,
    "@/components/notifications/notification-runtime": notificationRuntime,
    "./notification-runtime": notificationRuntime,
    "@/components/native/app-update-control": `export function AppUpdateControl(){return null;}`,
    "@/lib/auth/account-switch": `export class AccountSwitchError extends Error{}; export const MAX_SAVED_ACCOUNTS=5; export async function listSavedAccounts(){return {accounts:[]};} const unavailable=async()=>{throw new Error('Account switching is outside this fixture');}; export const removeSavedAccount=unavailable,startWebAccountSignIn=unavailable,switchSavedAccount=unavailable;`,
    "@/lib/native/auth": `export class NativeGoogleSignInError extends Error{}; export async function startNativeGoogleSignIn(){throw new Error('Native sign-in is outside this fixture');}`,
    "@/components/navigation": `export * from './components/navigation/mobile-chrome-context'; export * from './components/navigation/mobile-top-navbar'; export * from './components/navigation/mobile-bottom-nav';`,
    "next/navigation": `import React from 'react'; const router={push(){},replace(){},refresh(){},back(){}}; export const useRouter=()=>router; export const usePathname=()=>'/settings'; export const useSearchParams=()=>React.useMemo(()=>new URLSearchParams(window.location.search),[window.location.search]);`,
  });
}
