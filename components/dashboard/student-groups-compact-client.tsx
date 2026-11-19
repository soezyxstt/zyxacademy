"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  Check,
  Copy,
  KeyRound,
  PencilLine,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { joinGroupWithToken } from "@/app/(student)/dashboard/groups/actions";
import {
  getGroupRenameStatus,
  renameStudentGroup,
} from "@/app/(student)/dashboard/groups/rename-actions";
import { useUrlTab } from "@/hooks/use-url-tab";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";

import { StudentIdentity } from "@/components/gamification/student-identity";
import type { StudentIdentity as PublicStudentIdentity } from "@/lib/gamification/social-contracts";
import { useStudentExperience } from "@/components/student-experience-provider";

export type StudentGroup = {
  id: string;
  name: string;
  packageName: string;
  frequencyLabel: string;
  totalQuotaSessions: number;
  usedQuotaSessions: number;
  remainingQuota?: number;
  weeklyQuotaSessions: number;
  weeklyUsedSessions: number;
  weeklyRemainingQuota: number;
  academicYear: string;
  semester: string;
  endDate: Date | null;
  joinedAt: Date;
  myRole: string;
  isLeader: boolean;
  courses: Array<{ id: string; title: string; category?: string | null }>;
  members: Array<{ id: string; name: string; role: string; isMe: boolean; identity?: PublicStudentIdentity | null }>;
  token: { token: string; capacity: number } | null;
};

type Props = {
  initialGroups: StudentGroup[];
  onLocalRename?: (name: string) => void;
};

type RenameStatus = {
  canRename: boolean;
  nextRenameAt: string | null;
} | null;

function formatDateTime(value: string, locale: "id" | "en") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function formatDate(value: Date, locale: "id" | "en") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

/**
 * Renders the compact student study group view with tabbed navigation,
 * package quota progress, membership details, and join token actions.
 *
 * @param props - Component props containing initial student groups.
 */
export function StudentGroupsCompactClient({ initialGroups, onLocalRename }: Props) {
  const t = useTranslations("student");
  const experience = useStudentExperience();
  const { locale } = useAppLocale();
  const router = useRouter();
  const defaultGroupId = initialGroups[0]?.id ?? "";
  const [selectedGroupId, setSelectedGroupId] = useUrlTab("group", defaultGroupId, defaultGroupId);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenLoading, setTokenLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renameStatus, setRenameStatus] = useState<RenameStatus>(null);
  const [renameError, setRenameError] = useState(false);
  const [statusLoading, startStatusTransition] = useTransition();
  const [saving, startSaveTransition] = useTransition();
  const statusRequest = useRef(0);

  const activeGroup = initialGroups.find((group) => group.id === selectedGroupId) ?? initialGroups[0] ?? null;

  const handleJoinToken = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tokenInput.trim()) return;

    setTokenLoading(true);
    try {
      const result = experience?.mode === "demo" ? { success: false } : await joinGroupWithToken(tokenInput.trim());
      if (!result.success) {
        toast.error(t("groups.joinFailed"));
        return;
      }
      toast.success(t("groups.joinSuccess"));
      setTokenInput("");
      router.refresh();
    } catch {
      toast.error(t("groups.systemError"));
    } finally {
      setTokenLoading(false);
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    toast.success(t("groups.tokenCopied"));
    window.setTimeout(() => setCopiedToken(null), 1600);
  };

  const closeRename = () => {
    statusRequest.current += 1;
    setRenameOpen(false);
    setRenameStatus(null);
  };

  const openRename = () => {
    if (!activeGroup) return;
    const requestId = ++statusRequest.current;
    setDraftName(activeGroup.name);
    setRenameError(false);
    setRenameStatus(null);
    setRenameOpen(true);

    if (onLocalRename) {
      setRenameStatus({ canRename: true, nextRenameAt: null });
      return;
    }

    startStatusTransition(async () => {
      try {
        const result = await getGroupRenameStatus(activeGroup.id);
        if (requestId !== statusRequest.current) return;
        if (!result.success) throw new Error();
        setDraftName(result.currentName);
        setRenameStatus({ canRename: result.canRename, nextRenameAt: result.nextRenameAt });
      } catch {
        if (requestId !== statusRequest.current) return;
        toast.error(t("groups.renameFailure"));
        closeRename();
      }
    });
  };

  const submitRename = () => {
    if (!activeGroup) return;
    const groupId = activeGroup.id;

    startSaveTransition(async () => {
      try {
        if (onLocalRename) {
          onLocalRename(draftName.trim());
          toast.success(t("groups.renameSuccess"));
          closeRename();
          return;
        }
        const result = await renameStudentGroup(groupId, draftName);
        if (!result.success) {
          toast.error(t("groups.renameFailure"));
          if ("nextRenameAt" in result && result.nextRenameAt) {
            setRenameStatus({ canRename: false, nextRenameAt: result.nextRenameAt });
          }
          return;
        }
        if (result.changed) toast.success(t("groups.renameSuccess"));
        closeRename();
        router.refresh();
      } catch {
        setRenameError(true);
        toast.error(t("groups.renameFailed"));
      }
    });
  };

  if (!activeGroup) {
    return (
      <section className="mx-auto max-w-xl rounded-xl border border-border/40 bg-card/30 p-(--panel-padding) sm:p-(--group-gap)">
        <div className="mb-3 flex items-center gap-2 border-b border-border/40 pb-2">
          <Users className="size-3.5 shrink-0 text-muted-foreground" />
          <h2 className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("groups.join")}</h2>
        </div>
        <form onSubmit={handleJoinToken} className="mt-4 flex gap-2">
          <Input
            type="text"
            placeholder={t("groups.tokenPlaceholder")}
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            className="min-w-0 flex-1 font-mono"
          />
          <Button type="submit" disabled={tokenLoading || !tokenInput.trim()}>
            {tokenLoading ? t("groups.processing") : t("groups.joinAction")}
          </Button>
        </form>
        <p className="mt-2 flex items-center gap-1.5 text-body-xs text-muted-foreground">
          <KeyRound className="size-3.5 shrink-0" />
          {t("groups.tokenHelp")}
        </p>
      </section>
    );
  }

  const totalPercent = Math.min(
    100,
    Math.round((activeGroup.usedQuotaSessions / Math.max(1, activeGroup.totalQuotaSessions)) * 100)
  );

  return (
    <div className="space-y-(--section-gap)">
      {initialGroups.length > 1 ? (
        <Tabs value={activeGroup.id} onValueChange={setSelectedGroupId} syncUrl={false}>
          <TabsList aria-label={t("groups.selectGroup")}>
            {initialGroups.map((group) => (
              <TabsTrigger key={group.id} value={group.id}>{group.name}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      <section className="border-t border-border/40 py-(--panel-padding)">
        <div className="flex flex-wrap items-start justify-between gap-(--compact-gap) border-b border-border/40 pb-(--related-gap)">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="min-w-0 break-words font-heading text-h5 font-bold text-foreground">
                {activeGroup.name}
              </h2>
              <button
                type="button"
                onClick={openRename}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                aria-label={t("groups.rename")}
                title={t("groups.rename")}
              >
                <PencilLine className="size-3.5" />
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-body-xs text-muted-foreground">
              <Badge variant="outline" className="border-border/50 text-body-2xs">
                {activeGroup.myRole === "leader" ? t("groups.leader") : t("groups.member")}
              </Badge>
              <span>{activeGroup.packageName}</span>
              <span>•</span>
              <span>{activeGroup.semester} {activeGroup.academicYear}</span>
            </div>
          </div>

          {activeGroup.totalQuotaSessions > 0 ? (
            <Button asChild size="sm" className="shrink-0 gap-1.5">
              <Link href={experience.href?.(`/dashboard/schedule?course=${encodeURIComponent(activeGroup.courses[0]?.id ?? "")}`) ?? "/dashboard/schedule"}>
                <CalendarRange className="size-3.5" />
                {t("groups.scheduleSession")}
              </Link>
            </Button>
          ) : null}
        </div>

        {activeGroup.totalQuotaSessions > 0 ? (
          <div className="py-4">
            <div className="flex items-end justify-between gap-(--related-gap)">
              <div>
                <p className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("groups.packageQuota")}</p>
                <p className="mt-1 font-heading text-h5 font-bold tabular-nums text-foreground">
                  {activeGroup.usedQuotaSessions}
                  <span className="ml-1 text-body-sm font-normal text-muted-foreground">
                / {t("groups.sessionCount", { count: activeGroup.totalQuotaSessions })}
                  </span>
                </p>
              </div>
              <p className="text-right text-body-xs text-muted-foreground">
                <span className="block font-heading text-h5 font-bold tabular-nums text-foreground">
                  {activeGroup.remainingQuota ?? Math.max(0, activeGroup.totalQuotaSessions - activeGroup.usedQuotaSessions)}
                </span>
                {t("groups.remaining")}
              </p>
            </div>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/70"
              role="progressbar"
              aria-valuenow={totalPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${totalPercent}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-body-xs text-muted-foreground">
              <span>{t("groups.weekUsage", { count: activeGroup.weeklyUsedSessions })}</span>
              <span>{activeGroup.frequencyLabel}</span>
            </div>
          </div>
        ) : (
          <div className="py-4">
            <div className="text-body-xs text-muted-foreground">
              <p className="font-semibold text-foreground">{t("groups.selfStudy")}</p>
              <p className="mt-0.5">{t("groups.selfStudyDescription")}</p>
            </div>
          </div>
        )}

        <div className="grid border-t border-border/30 sm:grid-cols-2">
          <div className="py-4 sm:pr-5">
            <div className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
              <CalendarDays className="size-4 text-muted-foreground" />
              {activeGroup.endDate ? t("groups.activeUntil", { date: formatDate(new Date(activeGroup.endDate), locale) }) : t("groups.fullSemester")}
            </div>
            <p className="mt-1 text-body-xs text-muted-foreground">
              {t("groups.joinedAt", { date: formatDate(new Date(activeGroup.joinedAt), locale) })}
            </p>
          </div>

          <div className="border-t border-border/30 py-(--panel-padding) sm:border-l sm:border-t-0 sm:pl-5">
            <div className="flex items-center justify-between gap-(--compact-gap)">
              <div className="min-w-0">
                <p className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("groups.members")}</p>
                <div className="mt-2 flex flex-wrap gap-x-(--related-gap) gap-y-2">
                  {activeGroup.members.map((member) => <StudentIdentity key={member.id} name={member.isMe ? t("groups.memberYou", { name: member.name }) : member.name} identity={member.identity} />)}
                </div>
              </div>
              <span className="shrink-0 text-body-xs tabular-nums text-muted-foreground">
                {activeGroup.members.length}{activeGroup.token ? `/${activeGroup.token.capacity}` : ""}
              </span>
            </div>
          </div>
        </div>

        {activeGroup.courses.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-t border-border/30 py-4">
            {activeGroup.courses.map((course) => (
              <Badge key={course.id} variant="secondary" className="border border-border/40 bg-muted/50 font-medium text-foreground/80">
                {course.title}
              </Badge>
            ))}
          </div>
        ) : null}

        {activeGroup.token && activeGroup.members.length < activeGroup.token.capacity ? (
          <div className="flex items-center justify-between gap-(--compact-gap) border-t border-border/30 pt-(--related-gap)">
            <div className="min-w-0">
              <p className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("groups.inviteToken")}</p>
              <p className="mt-0.5 break-all font-mono text-body-sm font-semibold text-foreground">{activeGroup.token.token}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => copyToken(activeGroup.token!.token)}
              className="shrink-0 gap-1.5"
            >
              {copiedToken === activeGroup.token.token ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {t("groups.copy")}
            </Button>
          </div>
        ) : null}
      </section>

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          if (!open && !saving) closeRename();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("groups.rename")}</DialogTitle>
            <DialogDescription>{t(onLocalRename ? "groups.nameLength" : "groups.cooldown")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1">
            <label htmlFor="student-group-name" className="text-body-sm font-semibold">{t("groups.newName")}</label>
            <Input
              id="student-group-name"
              value={draftName}
              maxLength={80}
              disabled={statusLoading || saving || renameStatus?.canRename === false}
              onChange={(event) => setDraftName(event.target.value)}
              autoComplete="off"
            />
            {renameError ? <p role="alert" className="text-body-xs text-destructive">{t("groups.renameFailed")}</p> : null}
            {renameStatus?.canRename === false && renameStatus.nextRenameAt ? (
              <p className="text-body-xs text-muted-foreground">
                {t("groups.cooldownUntil", { date: formatDateTime(renameStatus.nextRenameAt, locale) })}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={closeRename}>{t("groups.cancel")}</Button>
            <Button
              type="button"
              disabled={
                statusLoading ||
                saving ||
                renameStatus?.canRename !== true ||
                draftName.trim().length < 3 ||
                draftName.trim() === activeGroup.name.trim()
              }
              onClick={submitRename}
            >
              {saving ? t("groups.saving") : t("groups.saved")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
