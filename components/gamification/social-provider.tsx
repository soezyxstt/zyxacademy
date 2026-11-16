"use client";

import { createContext, useContext, type ReactNode } from "react";
import { followStudentAction, getPublicStudentProfileAction, getStudentFollowListAction, removeFollowerAction, searchVisibleStudentsAction, unfollowStudentAction } from "@/lib/gamification/social-actions";
import type { PublicStudentProfile, StudentIdentity } from "@/lib/gamification/social-contracts";

type FollowEntry = StudentIdentity & { avatarMode: "photo" | "badge"; avatarBadgeId: string | null; badgeTier: number | null };
export type StudentSocialAdapter = {
  profileHref?: (id: string) => string;
  profile: (id: string) => Promise<PublicStudentProfile | null>;
  search: (query: string) => Promise<StudentIdentity[]>;
  follow: (id: string) => Promise<unknown>;
  unfollow: (id: string) => Promise<unknown>;
  removeFollower: (id: string) => Promise<unknown>;
  subscribe?: (listener: () => void) => () => void;
  list: (direction: "followers" | "following", cursor?: string) => Promise<{ entries: FollowEntry[]; nextCursor: string | null }>;
};
const listeners = new Set<() => void>();
async function changed(action: () => Promise<unknown>) {
  const result = await action();
  listeners.forEach(listener => listener());
  return result;
}
const live: StudentSocialAdapter = {
  profileHref: id => `/students/${encodeURIComponent(id)}`,
  profile: getPublicStudentProfileAction, search: searchVisibleStudentsAction,
  follow: id => changed(() => followStudentAction(id)),
  unfollow: id => changed(() => unfollowStudentAction(id)),
  removeFollower: id => changed(() => removeFollowerAction(id)),
  subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  list: getStudentFollowListAction,
};
const Context = createContext<StudentSocialAdapter>(live);
export function StudentSocialProvider({ value, children }: { value: StudentSocialAdapter; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useStudentSocial() { return useContext(Context); }
