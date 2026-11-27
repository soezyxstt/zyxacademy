"""Prepare a minimal production-mode Next app using the real student tab links and dashboard route."""

import json
import sys
import tempfile
from pathlib import Path
root = Path(__file__).resolve().parents[4]
dependencies = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / "node_modules"
if not (dependencies / "next" / "package.json").is_file():
    sys.exit("Pass the repository node_modules path as the first argument.")
dest = Path(tempfile.mkdtemp(prefix="zyx-tab-fixture-"))
(dest/'node_modules').symlink_to(dependencies)
def put(path, text):
 p=dest/path
 p.parent.mkdir(parents=True, exist_ok=True)
 p.write_text(text)
def copy(source, target=None):
 put(target or source, (root/source).read_text())
def route(file):
 copy('app/(student)/'+file, 'app/'+file)
for file in ['dashboard/page.tsx','dashboard/loading.tsx','dashboard/dashboard-skeletons.tsx','dashboard/discussions/page.tsx','dashboard/discussions/loading.tsx']:
 route(file)
alias={}
def stub(spec, body):
 key=spec.removeprefix('@/')
 if key.startswith('app/(student)/'): key=key.replace('app/(student)/','app/',1)
 else: alias[spec]=['./stubs/'+key+'.tsx'];key='stubs/'+key
 put(key+'.tsx',body)
for file in ['components/navigation/student/student-tab-reuse.tsx','components/navigation/student/student-mobile-bottom-nav.tsx','components/navigation/student/student-mobile-destinations.ts','components/navigation/student/student-nav-model.ts','components/navigation/mobile-bottom-nav.tsx','components/navigation/mobile-chrome-context.tsx','components/student-experience-provider.tsx','components/application-page.tsx','components/ui/skeleton.tsx','components/discussions/discussion-skeleton.tsx','lib/auth/account-transition-state.ts']:
 copy(file)
copy('components/navigation/student/student-mobile-hrefs.mjs')
stub('@/components/navigation','export { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";')
put('lib/pka-config.ts', 'export const PKA_COURSE_ID = "pka";')
stub('@/lib/auth-client','"use client"; export const useSession = () => ({data: {session: {id:"fixture-session"}}, isPending: false, error: null});')
stub('@/lib/utils','export function cn(...values:any[]) {return values.filter(Boolean).join(" ");}')
stub('@/lib/native/haptics','export async function hapticSelection(){}')
stub('@/lib/i18n/client','export const useTranslations=()=> (id:string)=> ({home:"Beranda",discuss:"Diskusi",courses:"Kelas"}[id]??id);')
stub('@/hooks/use-query-account','export const useQueryAccountId=()=>"fixture";')
stub('@/hooks/use-viewport-mode','export const useViewportMode=()=>"mobile";')
stub('@/components/discussions/discussion-count-badge','export const DISCUSSION_COUNTS_CHANGED="test-counts";')
stub('@/lib/discussions/counts-query','export const discussionCountsQuery=()=>({queryKey:["counts"],queryFn:async()=>null});')
stub('@/lib/query/keys','export const queryKeys={discussions:{all: (id:string)=>[id]}};')
stub('@/components/page-header','export const PageHeader=({title}:any)=><h1>{title}</h1>;')
stub('@/components/i18n/translated-text','export const TranslatedText=({messageKey}:any)=>messageKey;')
stub('@/lib/auth-session','import {cookies} from "next/headers"; export async function getAuthSession(){ await cookies(); return { user:{id:"fixture",name:"Fixture Student"} }; }')
stub('@/lib/i18n/server','export async function getTranslations(){return (key:string)=>key;}')
stub('@/lib/site','export function createMetadata(input:any){return {title:input.title};}')
stub('@/components/gamification/dashboard-summary','export const GamificationDashboardSummary=()=>null;')
stub('@/components/dashboard/intervention-banner','export const InterventionBanner=()=>null;')
stub('@/components/dashboard/student-dashboard-content','export const StudentDashboardContent=({sections}:any)=><>{Object.values(sections) as any}</>;')
stub('@/app/(student)/dashboard/actions','import {cookies} from "next/headers"; export async function getStudentEnrollments(){await cookies(); await new Promise(r=>setTimeout(r,650)); return [{id:"course"}];}')
put('app/dashboard/dashboard-section-error-boundary.tsx','export const DashboardSectionErrorBoundary=({children}:any)=>children;')
put('app/dashboard/dashboard-sections.tsx','''import { cookies } from "next/headers";
export async function PrimaryLearningSection(){await cookies(); await new Promise(r=>setTimeout(r,300)); return <h1 data-fixture-page="dashboard">Dashboard {(globalThis as any).fixtureDashboardRevision ?? 1}</h1>;}
export const AvailableAssessmentsSection=()=>null, DashboardOnboardingSection=()=>null, ProfilePromptSection=()=>null, RecommendedCoursesSection=()=>null, ReviewQueueSection=()=>null, TodayPlanSection=()=>null, WeakConceptsSection=()=>null, WeeklyReflectionSection=()=>null;''')
stub('@/components/discussions/discussion-page','''import {cookies} from "next/headers"; import {revalidatePath} from "next/cache";
async function invalidate(){"use server"; (globalThis as any).fixtureDashboardRevision = 2; revalidatePath("/dashboard");}
export async function DiscussionPage(){await cookies(); await new Promise(r=>setTimeout(r,650));return <><h1 data-fixture-page="discussion">Discussion</h1><form action={invalidate}><button>Invalidate dashboard</button></form></>;}''')
put('app/courses/page.tsx','import {cookies} from "next/headers"; export default async function Page(){ await cookies(); await new Promise(r=>setTimeout(r,650)); return <h1 data-fixture-page="courses">Courses</h1>; }')
put('app/courses/loading.tsx','export default function Loading(){return <div role="status" data-fixture-loading>Loading courses</div>;}')
put('app/providers.tsx','''"use client";
import {useState} from "react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {StudentTabReuse} from "@/components/navigation/student/student-tab-reuse";
import {StudentMobileBottomNav} from "@/components/navigation/student/student-mobile-bottom-nav";
import {setAccountTransitionPending} from "@/lib/auth/account-transition-state";
export default function Providers({children}:any){
 const [client]=useState(()=>new QueryClient());
 return <QueryClientProvider client={client}><StudentTabReuse><StudentMobileBottomNav />
 <button onClick={()=>setAccountTransitionPending(true)}>Begin transition</button>
 <button onClick={()=>setAccountTransitionPending(false)}>Cancel transition</button>
 {children}</StudentTabReuse></QueryClientProvider>;
}''')
put('app/layout.tsx','import Providers from "./providers"; export default function Layout({children}:any){return <html><body><Providers>{children}</Providers></body></html>;}')
put('package.json',json.dumps({'name':'student-route-fixture','private':True}))
put('tsconfig.json',json.dumps({'compilerOptions':{'baseUrl':'.','paths':{**alias,'@/*':['./*'],'@/app/(student)/*':['./app/*']}}}))
put('next.config.mjs','export default {typescript:{ignoreBuildErrors:true},experimental:{cpus:1}};')
print(dest)
