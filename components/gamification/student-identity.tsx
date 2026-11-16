"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { MICRO } from "@/lib/gamification/catalog";
import type { BadgeFamily, RankKey } from "@/lib/gamification/contracts";
import type { PublicStudentProfile, StudentIdentity as Identity } from "@/lib/gamification/social-contracts";
import { useStudentSocial } from "./social-provider";
import { AchievementBoard, profileBadgeFamilies } from "./achievement-board";
import { RankArtwork } from "./artwork";
import { StudentAvatar } from "./student-avatar";
import { ProfileMascot } from "./profile-mascot";

const ranks: RankKey[] = ["rakyat", "kades", "camat", "bupati", "gubernur", "presiden"];
function safeRank(rank: string): RankKey | undefined {
  return ranks.find(value => value === rank);
}

/** A public ID must come from a viewer-filtered social projection. */
export function StudentIdentity({ name, identity, showAvatar = true }: { name: string; identity?: Identity | null; showAvatar?: boolean }) {
  const [open, setOpen] = useState(false);
  const content = <StudentIdentityContent name={name} identity={identity} showAvatar={showAvatar} />;
  if (!identity) return <span className="inline-flex min-w-0 items-center gap-2">{content}</span>;
  return <><button type="button" onClick={() => setOpen(true)} className="inline-flex min-w-0 items-center gap-2 rounded-md text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{content}</button><StudentProfileDialog publicId={identity.publicId} open={open} onOpenChange={setOpen} /></>;
}

/** Shared noninteractive content for buttons and command-menu items. */
export function StudentIdentityContent({ name, identity, showAvatar = true }: { name: string; identity?: Identity | null; showAvatar?: boolean }) {
  const rank = identity && safeRank(identity.rankKey);
  const label = identity?.displayName ?? name;
  return <>
    {showAvatar && <StudentAvatar name={label} image={identity?.avatarUrl} frameId={identity?.equippedFrameId} themeId={identity?.equippedThemeId} size={40} />}
    <span className="min-w-0 text-left"><span className="block break-words text-body-sm font-semibold">{label}</span>{rank && <span className="block text-body-xs capitalize text-muted-foreground">{rank}</span>}</span>
  </>;
}

/** Fetches the public projection on each open, so visibility and blocks are rechecked. */
export function StudentProfileDialog({ publicId, open, onOpenChange }: { publicId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const social = useStudentSocial();
  const { locale } = useAppLocale();
  const english = locale === "en";
  const t = useTranslations("student");
  const [profile, setProfile] = useState<PublicStudentProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!open) return;
    let active = true;
    setProfile(null);
    setStatus("loading");
    setMessage("");
    social.profile(publicId).then(result => {
      if (!active) return;
      setProfile(result);
      setStatus(result ? "ready" : "unavailable");
    }).catch(() => { if (active) setStatus("unavailable"); });
    return () => { active = false; };
  }, [open, publicId, attempt, social]);
  const toggleFollow = () => {
    if (!profile) return;
    const following = profile.isFollowing;
    setMessage("");
    startTransition(async () => {
      try {
        if (following) await social.unfollow(publicId);
        else await social.follow(publicId);
        setProfile(current => current?.publicId === publicId ? { ...current, isFollowing: !following, followerCount: Math.max(0, current.followerCount + (following ? -1 : 1)) } : current);
      } catch {
        setMessage(english ? "Could not update follow. Try again." : "Gagal memperbarui status mengikuti. Coba lagi.");
      }
    });
  };
  const familyLabels = Object.fromEntries(profileBadgeFamilies.map(family => [family, t(`profileCustomization.families.${family}`)])) as Record<BadgeFamily, string>;
  const rank = profile && safeRank(profile.rankKey);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>{english ? "Student profile" : "Profil siswa"}</DialogTitle></DialogHeader>
      {status === "loading" && <p role="status" className="text-body-sm text-muted-foreground">{english ? "Loading profile" : "Memuat profil"}</p>}
      {status === "unavailable" && <div className="space-y-3"><AdminEmptyState icon={UserRound} title={english ? "Profile unavailable" : "Profil tidak tersedia"} /><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>{english ? "Try again" : "Coba lagi"}</Button></div>}
      {status === "ready" && profile && <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <StudentAvatar name={profile.displayName} image={profile.avatarUrl} frameId={profile.equippedFrameId} themeId={profile.equippedThemeId} size={80} />
          <div className="min-w-[150px] flex-1"><h3 className="break-words font-heading text-body-base font-bold">{profile.displayName}</h3>{[profile.major, profile.faculty].filter(Boolean).length > 0 && <p className="text-body-xs text-muted-foreground">{[profile.major, profile.faculty].filter(Boolean).join(" · ")}</p>}
            {rank && <div className="flex items-center gap-1 text-body-xs capitalize text-muted-foreground"><RankArtwork rank={rank} size={24} />{rank}</div>}
          </div>
          <ProfileMascot cosmeticId={profile.equippedZyraAvatarId} />
          {(profile.canFollow || profile.isFollowing) && <Button disabled={pending} onClick={toggleFollow}>{profile.isFollowing ? "Unfollow" : "Follow"}</Button>}
        </div>
        {social.profileHref && <Button asChild variant="outline"><Link href={social.profileHref(publicId)} onClick={() => onOpenChange(false)}>{english ? "View profile" : "Lihat profil"}</Link></Button>}
        {message && <p role="alert" className="text-body-xs text-status-error">{message}</p>}
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-y py-3 text-body-sm">{profile.baseXpMicro != null && <span><strong>{new Intl.NumberFormat(locale).format(profile.baseXpMicro / MICRO)}</strong> XP</span>}<span><strong>{new Intl.NumberFormat(locale).format(profile.followerCount)}</strong> {english ? "followers" : "pengikut"}</span><span><strong>{new Intl.NumberFormat(locale).format(profile.followingCount)}</strong> {english ? "following" : "diikuti"}</span><span><strong>{profile.earnedBadges.length}</strong> {english ? "badges" : "lencana"}</span></div>
        <AchievementBoard compact badges={profile.earnedBadges} featuredBadgeIds={profile.featuredBadgeIds} title={t("profileCustomization.badgeBoard")} familyLabels={familyLabels} lockedLabel={t("profileCustomization.locked")} tierLabel={tier => t("achievementPage.tier", { tier })} />
      </div>}
    </DialogContent>
  </Dialog>;
}
