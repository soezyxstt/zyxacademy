import { buildFixture } from "./interactive-document-build";

/** Bundle the production discussion routes. Only the Next and server boundaries are supplied here. */
export function buildStudentDiscussionsReference() {
  const account = `const user={id:'student-fixture',name:'Aruni Rasyid',role:'student'};const session={id:'discussion-fixture-session'};const data={user,session};`;
  const unavailable = `const outside=async()=>{throw new Error('This action is outside the discussion reference');};`;
  return buildFixture("tests/visual/fixtures/student-discussions-reference.tsx", "", {
    "next/navigation": `import {useMemo} from 'react';
      const router={push:href=>location.assign(href),replace:href=>location.replace(href),refresh:()=>location.reload(),back:()=>history.back()};
      export const useRouter=()=>router;export const usePathname=()=>location.pathname;
      export const useSearchParams=()=>useMemo(()=>new URLSearchParams(location.search),[location.search]);
      export function redirect(href){location.replace(href);throw Object.assign(new Error('Fixture navigation'),{name:'FixtureRedirect'});}
      export function notFound(){throw new Error('Fixture discussion access denied');}`,
    "@/components/navigation": `export {ViewportSwitch} from '@/components/navigation/viewport-switch';
      export {useHideMobileBottomNav,useMobileChrome,useMobileTopNav,useMobileTopNavSearch} from '@/components/navigation/mobile-chrome-context';
      export {MOBILE_TOP_NAV_ICON_BUTTON_CLASS,MobileTopNavActionButton} from '@/components/navigation/mobile-top-navbar';`,
    "@/lib/auth-session": `${account}export const getAuthSession=async()=>data;`,
    "@/lib/auth-client": `${account}export const useSession=()=>({data,isPending:false});`,
    "@/lib/discussions/session": `export const getSessionDiscussionActor=async()=>({id:'student-fixture',role:'student'});`,
    "@/lib/discussions/access": `export const getStudentDiscussionListScope=async()=>null;
      export const resolveDiscussionCourses=async(_,ids)=>new Map(ids.map(id=>[id,{hasFullContentAccess:id==='matematika-1',canonicalCourseId:id}]));
      export async function requireDiscussionCourse(actor,id){if(actor.role!=='student'||id!=='matematika-1')throw new Error('Course not admitted by fixture');}`,
    "@/lib/gamification/queries": `export const getEquippedZyraAppearance=async()=>({skinId:null});`,
    "@/lib/i18n/server": `import {createTranslator} from 'next-intl';import discussions from '@/messages/id/discussions.json';
      export const getTranslations=async namespace=>createTranslator({locale:'id',messages:{discussions},namespace});`,
    "@/lib/discussions/actions": `${unavailable}
      export const createThread=outside,deleteMessage=outside,edit=outside,forward=outside,getAuthorProfile=outside,listReports=outside,reply=outside,report=outside,resolveReport=outside,setMute=outside,setReaction=outside,setResolved=outside;
      export async function markRead(threadId,throughSeq,receipt,messageIds){
        const response=await fetch('/api/native/student/community/discussion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'read',threadId,throughSeq,receipt,messageIds})});
        if(!response.ok)throw new Error('Fixture read failed');return {throughSeq};
      }`,
    "@/lib/gamification/social-actions": `${unavailable}
      export const followStudentAction=outside,getPublicStudentProfileAction=outside,getStudentFollowListAction=outside,
        removeFollowerAction=outside,searchVisibleStudentsAction=outside,unfollowStudentAction=outside;`,
    "./discussion-read-state": `export const getDiscussionReadThrough=async()=>0;`,
    "./discussion-ai-status": `export const listDiscussionAiStatuses=async()=>[];`,
  });
}
