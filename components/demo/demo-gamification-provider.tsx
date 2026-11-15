"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StudentSocialProvider, type StudentSocialAdapter } from "@/components/gamification/social-provider";
import { changeDemoReward, demoBadges, demoFeaturedBadges, demoGamificationChangeEvent, demoGamificationKey, demoPeople, demoProfile, demoSummary, initialDemoGamification, readDemoGamification, type DemoGamificationState } from "@/lib/demo/gamification";
import type { CosmeticSlot } from "@/lib/gamification/contracts";

type ContextValue = { state: DemoGamificationState; changeReward: (id: string, action: "buy" | "equip", slot: CosmeticSlot) => Promise<{ ok: boolean }> };
const Context = createContext<ContextValue | null>(null);
export function DemoGamificationProvider({ name, children }: { name: string; children: ReactNode }) {
  const [state, setState] = useState(initialDemoGamification);
  const stateRef = useRef(state);
  const nameRef = useRef(name);
  nameRef.current = name;
  useEffect(() => {
    const read = () => { try { const next = readDemoGamification(localStorage.getItem(demoGamificationKey)); stateRef.current = next; setState(next); } catch { /* Keep the in-memory fictional state. */ } };
    read();
    window.addEventListener(demoGamificationChangeEvent, read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener(demoGamificationChangeEvent, read); window.removeEventListener("storage", read); };
  }, []);
  const save = useCallback((next: DemoGamificationState) => {
    localStorage.setItem(demoGamificationKey, JSON.stringify(next));
    stateRef.current = next;
    setState(next);
    window.dispatchEvent(new Event(demoGamificationChangeEvent));
  }, []);
  const social = useMemo<StudentSocialAdapter>(() => ({
    profile: async id => id === "demo-self" ? { publicId: id, displayName: nameRef.current, avatarUrl: null, avatarBadgeId: null, avatarMode: "photo", avatarBadgeTier: null, rankKey: demoSummary.rankKey, baseXpMicro: demoSummary.baseXpMicro, earnedBadges: demoBadges.filter(item => item.tier > 0), featuredBadgeIds: demoFeaturedBadges, equippedFrameId: stateRef.current.equipped.frame ?? null, equippedThemeId: stateRef.current.equipped.theme ?? null, equippedTitleId: null, equippedZyraAvatarId: stateRef.current.equipped.zyra_avatar ?? null, major: "Teknik Informatika", faculty: "STEI", followerCount: stateRef.current.followers.length, followingCount: stateRef.current.following.length, canFollow: false, isFollowing: false } : demoProfile(id, stateRef.current.following),
    search: async query => { const text = query.trim().toLocaleLowerCase("id"); return text.length < 2 || text.length > 80 ? [] : demoPeople.filter(person => person.displayName.toLocaleLowerCase("id").includes(text)); },
    follow: async id => { if (!demoPeople.some(person => person.publicId === id)) throw new Error("Unavailable"); save({ ...stateRef.current, following: [...new Set([...stateRef.current.following, id])] }); },
    unfollow: async id => save({ ...stateRef.current, following: stateRef.current.following.filter(item => item !== id) }),
    removeFollower: async id => save({ ...stateRef.current, followers: stateRef.current.followers.filter(item => item !== id) }),
    subscribe: listener => { window.addEventListener(demoGamificationChangeEvent, listener); return () => window.removeEventListener(demoGamificationChangeEvent, listener); },
    list: async direction => ({ entries: demoPeople.filter(person => stateRef.current[direction].includes(person.publicId)).map(person => ({ ...person, avatarMode: "photo" as const, avatarBadgeId: null, badgeTier: null })), nextCursor: null }),
  }), [save]);
  const changeReward = useCallback(async (id: string, action: "buy" | "equip", slot: CosmeticSlot) => {
    const next = changeDemoReward(stateRef.current, id, action, slot);
    if (!next) return { ok: false };
    save(next);
    return { ok: true };
  }, [save]);
  return <Context.Provider value={{ state, changeReward }}><StudentSocialProvider value={social}>{children}</StudentSocialProvider></Context.Provider>;
}
export function useDemoGamification() { const value = useContext(Context); if (!value) throw new Error("DemoGamificationProvider missing"); return value; }
