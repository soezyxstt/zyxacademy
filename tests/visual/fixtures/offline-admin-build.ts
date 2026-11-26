import { buildFixture } from "./interactive-document-build";

/** The shipped policy form and admin chrome, with only server transport isolated. */
export function buildOfflineAdminFixture() {
  const notificationRuntime = `export const ZYX_NOTIFICATIONS_CHANGED='zyx:notifications-changed'; export function NotificationRuntime(){return null;} export function NotificationRuntimeForAccount(){return null;}`;
  return buildFixture("tests/visual/fixtures/offline-admin.tsx", "", {
    "@/lib/i18n/actions": `export async function saveLocaleSelection(){return {success:true};} export async function mirrorResolvedAccountLocaleCookie(){return {success:true};}`,
    "@/components/providers/locale-provider": `export {LocaleProvider,useAppLocale} from './components/providers/locale-provider';`,
    "@/lib/auth-client": `const data={user:{id:'fixture-admin',name:'Admin Zyx',email:'admin@example.test',role:'admin'}}; export const useSession=()=>({data,isPending:false}); export async function signOut(){throw new Error('Sign out is outside this fixture');} export const authClient={};`,
    "@/components/command-menu": `const value={setOpen(){},openWithQuery(){}}; export const useCommandMenu=()=>value;`,
    "@/app/(admin)/admin/(academic)/courses/actions": `export async function getCourses(){return [];} export async function getCourseNavContext(){return null;}`,
    "@/hooks/use-query-account": `export function useSyncQueryAccount(){} export const useQueryAccountId=()=>undefined; export const useQueryAccountCurrent=()=>true;`,
    "@/components/notifications/notification-runtime": notificationRuntime,
    "./notification-runtime": notificationRuntime,
    "@/components/native/app-update-control": `export function AppUpdateControl(){return null;}`,
    "@/lib/auth/account-switch": `export class AccountSwitchError extends Error{}; export const MAX_SAVED_ACCOUNTS=5; export async function listSavedAccounts(){return {accounts:[]};} const unavailable=async()=>{throw new Error('Account switching is outside this fixture');}; export const removeSavedAccount=unavailable,startWebAccountSignIn=unavailable,switchSavedAccount=unavailable;`,
    "@/lib/native/auth": `export class NativeGoogleSignInError extends Error{}; export async function startNativeGoogleSignIn(){throw new Error('Native sign-in is outside this fixture');}`,
    "@/components/navigation": `export * from './components/navigation/mobile-chrome-context'; export * from './components/navigation/mobile-top-navbar'; export * from './components/navigation/mobile-bottom-nav';`,
    "next/navigation": `const router={push(){},replace(){},refresh(){},back(){}}; export const useRouter=()=>router; export const usePathname=()=>'/admin/ops/offline'; export const useSearchParams=()=>new URLSearchParams(window.location.search);`,
  });
}
