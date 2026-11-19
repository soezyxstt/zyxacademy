"use client";

import { useEffect, useState, useTransition } from "react";
import { UserRound } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AchievementBoard, profileBadgeFamilies } from "@/components/gamification/achievement-board";
import { RankArtwork } from "@/components/gamification/artwork";
import { ProfileMascot } from "@/components/gamification/profile-mascot";
import { StudentAvatar } from "@/components/gamification/student-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MICRO } from "@/lib/gamification/catalog";
import type { BadgeFamily, RankKey } from "@/lib/gamification/contracts";
import type { DiscussionAuthorProfile } from "@/lib/discussions/contracts";
import { followStudentAction, unfollowStudentAction } from "@/lib/gamification/social-actions";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import type { DiscussionPerson } from "./view-model";

const RANKS: RankKey[] = ["rakyat", "kades", "camat", "bupati", "gubernur", "presiden"];

function safeRank(rank: string): RankKey | undefined {
  return RANKS.find((value) => value === rank);
}

export function DiscussionProfileDialog({
  open,
  onOpenChange,
  author,
  loadProfile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  author: DiscussionPerson | null;
  loadProfile?: (authorId: string) => Promise<DiscussionAuthorProfile>;
}) {
  const t = useTranslations("discussions");
  const studentT = useTranslations("student");
  const { locale } = useAppLocale();
  const [data, setData] = useState<DiscussionAuthorProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [followMessage, setFollowMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !author?.id) return;
    if (!loadProfile) {
      setData({
        kind: "limited",
        id: author.id,
        name: author.name,
        role: author.role === "zyra" ? null : author.role,
        avatarUrl: author.avatarUrl ?? null,
        visibilityReason: author.role === "student" ? "private" : "staff",
      });
      setStatus("ready");
      return;
    }
    let active = true;
    setData(null);
    setStatus("loading");
    setFollowMessage("");
    void loadProfile(author.id)
      .then((result) => {
        if (!active) return;
        setData(result);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [open, author?.id, author?.name, author?.role, author?.avatarUrl, attempt, loadProfile]);

  const toggleFollow = () => {
    if (!data || data.kind !== "student") return;
    const publicId = data.profile.publicId;
    const following = data.profile.isFollowing;
    setFollowMessage("");
    startTransition(async () => {
      try {
        if (following) await unfollowStudentAction(publicId);
        else await followStudentAction(publicId);
        setData((current) =>
          current?.kind === "student" && current.profile.publicId === publicId
            ? {
                ...current,
                profile: {
                  ...current.profile,
                  isFollowing: !following,
                  followerCount: Math.max(0, current.profile.followerCount + (following ? -1 : 1)),
                },
              }
            : current,
        );
      } catch {
        setFollowMessage(t("followError"));
      }
    });
  };

  const familyLabels = Object.fromEntries(
    profileBadgeFamilies.map((family) => [family, studentT(`profileCustomization.families.${family}`)]),
  ) as Record<BadgeFamily, string>;

  const studentProfile = data?.kind === "student" ? data.profile : null;
  const rank = studentProfile ? safeRank(studentProfile.rankKey) : undefined;
  const roleKey =
    data?.role === "student"
      ? "role_student"
      : data?.role === "tutor"
        ? "role_tutor"
        : data?.role === "admin"
          ? "role_admin"
          : "role_unknown";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{studentProfile ? t("profileStudentTitle") : t("profileTitle")}</DialogTitle>
        </DialogHeader>

        {status === "loading" && (
          <p role="status" className="text-body-sm text-muted-foreground">
            {t("loadingProfile")}
          </p>
        )}

        {status === "error" && (
          <div className="space-y-3">
            <AdminEmptyState icon={UserRound} title={t("profileUnavailable")} />
            <Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              {t("retry")}
            </Button>
          </div>
        )}

        {status === "ready" && data?.kind === "limited" && (
          <div className="flex flex-wrap items-center gap-4 py-2">
            <StudentAvatar name={data.name} image={data.avatarUrl} size={64} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="break-words font-heading text-body-base font-bold">{data.name}</h3>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-body-xs text-muted-foreground">
                  {t(roleKey)}
                </span>
              </div>
              <p className="text-body-xs text-muted-foreground">
                {data.visibilityReason === "staff"
                  ? t("profileStaffNote")
                  : data.visibilityReason === "private"
                    ? t("profilePrivateNote")
                    : data.visibilityReason === "blocked"
                      ? t("profileBlockedNote")
                      : t("profileUnavailable")}
              </p>
            </div>
          </div>
        )}

        {status === "ready" && studentProfile && (
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <StudentAvatar
                name={studentProfile.displayName}
                image={studentProfile.avatarUrl}
                frameId={studentProfile.equippedFrameId}
                themeId={studentProfile.equippedThemeId}
                size={80}
              />
              <div className="min-w-[150px] flex-1">
                <h3 className="break-words font-heading text-body-base font-bold">
                  {studentProfile.displayName}
                </h3>
                {[studentProfile.major, studentProfile.faculty].filter(Boolean).length > 0 && (
                  <p className="text-body-xs text-muted-foreground">
                    {[studentProfile.major, studentProfile.faculty].filter(Boolean).join(" · ")}
                  </p>
                )}
                {rank && (
                  <div className="flex items-center gap-1 text-body-xs capitalize text-muted-foreground">
                    <RankArtwork rank={rank} size={24} />
                    {rank}
                  </div>
                )}
              </div>
              <ProfileMascot cosmeticId={studentProfile.equippedZyraAvatarId} suitId={studentProfile.equippedPetSuitId} actionId={studentProfile.equippedPetActionId} />
              {(studentProfile.canFollow || studentProfile.isFollowing) && (
                <Button type="button" disabled={pending} onClick={toggleFollow}>
                  {studentProfile.isFollowing ? t("unfollow") : t("follow")}
                </Button>
              )}
            </div>

            {followMessage && (
              <p role="alert" className="text-body-xs text-destructive">
                {followMessage}
              </p>
            )}

            <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-border py-3 text-body-sm">
              {studentProfile.baseXpMicro != null && (
                <span>
                  <strong>{new Intl.NumberFormat(locale).format(studentProfile.baseXpMicro / MICRO)}</strong> XP
                </span>
              )}
              <span>
                <strong>{new Intl.NumberFormat(locale).format(studentProfile.followerCount)}</strong>{" "}
                {t("followers")}
              </span>
              <span>
                <strong>{new Intl.NumberFormat(locale).format(studentProfile.followingCount)}</strong>{" "}
                {t("following")}
              </span>
              <span>
                <strong>{studentProfile.earnedBadges.length}</strong> {t("badges")}
              </span>
            </div>

            <AchievementBoard
              compact
              badges={studentProfile.earnedBadges}
              featuredBadgeIds={studentProfile.featuredBadgeIds}
              title={studentT("profileCustomization.badgeBoard")}
              familyLabels={familyLabels}
              lockedLabel={studentT("profileCustomization.locked")}
              tierLabel={(tier) => studentT("achievementPage.tier", { tier })}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
