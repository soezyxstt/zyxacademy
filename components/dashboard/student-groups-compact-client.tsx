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
import { formatIsoDate } from "@/lib/date-utils";
import { useUrlTab } from "@/hooks/use-url-tab";

type StudentGroup = {
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
  members: Array<{ id: string; name: string; role: string; isMe: boolean }>;
  token: { token: string; capacity: number } | null;
};

type Props = {
  initialGroups: StudentGroup[];
};

type RenameStatus = {
  canRename: boolean;
  nextRenameAt: string | null;
} | null;

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export function StudentGroupsCompactClient({ initialGroups }: Props) {
  const router = useRouter();
  const defaultGroupId = initialGroups[0]?.id ?? "";
  const [selectedGroupId, setSelectedGroupId] = useUrlTab("group", defaultGroupId, defaultGroupId);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenLoading, setTokenLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renameStatus, setRenameStatus] = useState<RenameStatus>(null);
  const [statusLoading, startStatusTransition] = useTransition();
  const [saving, startSaveTransition] = useTransition();
  const statusRequest = useRef(0);

  const activeGroup = initialGroups.find((group) => group.id === selectedGroupId) ?? initialGroups[0] ?? null;

  const handleJoinToken = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tokenInput.trim()) return;

    setTokenLoading(true);
    try {
      const result = await joinGroupWithToken(tokenInput.trim());
      if (!result.success) {
        toast.error(result.error || "Gagal bergabung ke kelompok");
        return;
      }
      toast.success("Berhasil bergabung ke kelompok belajar.");
      setTokenInput("");
      router.refresh();
    } catch {
      toast.error("Terjadi kesalahan sistem");
    } finally {
      setTokenLoading(false);
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    toast.success("Token kelompok disalin");
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
    setRenameStatus(null);
    setRenameOpen(true);

    startStatusTransition(async () => {
      const result = await getGroupRenameStatus(activeGroup.id);
      if (requestId !== statusRequest.current) return;
      if (!result.success) {
        toast.error(result.error);
        closeRename();
        return;
      }
      setDraftName(result.currentName);
      setRenameStatus({ canRename: result.canRename, nextRenameAt: result.nextRenameAt });
    });
  };

  const submitRename = () => {
    if (!activeGroup) return;
    const groupId = activeGroup.id;

    startSaveTransition(async () => {
      const result = await renameStudentGroup(groupId, draftName);
      if (!result.success) {
        toast.error(result.error);
        if ("nextRenameAt" in result && result.nextRenameAt) {
          setRenameStatus({ canRename: false, nextRenameAt: result.nextRenameAt });
        }
        return;
      }
      if (result.changed) toast.success("Nama kelompok berhasil diganti.");
      closeRename();
      router.refresh();
    });
  };

  if (!activeGroup) {
    return (
      <section className="mx-auto max-w-xl border-y border-border/60 py-5 sm:rounded-xl sm:border sm:p-5">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-brand-primary" />
          <h2 className="font-heading text-body-base font-bold text-foreground">Gabung kelompok belajar</h2>
        </div>
        <form onSubmit={handleJoinToken} className="mt-4 flex gap-2">
          <Input
            type="text"
            placeholder="Token kelompok"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            className="min-w-0 flex-1 font-mono"
          />
          <Button type="submit" disabled={tokenLoading || !tokenInput.trim()}>
            {tokenLoading ? "Memproses" : "Gabung"}
          </Button>
        </form>
        <p className="mt-2 flex items-center gap-1.5 text-body-xs text-muted-foreground">
          <KeyRound className="size-3.5 shrink-0" />
          Gunakan token dari admin atau anggota kelompok.
        </p>
      </section>
    );
  }

  const totalPercent = Math.min(
    100,
    Math.round((activeGroup.usedQuotaSessions / Math.max(1, activeGroup.totalQuotaSessions)) * 100)
  );

  return (
    <div className="space-y-4">
      {initialGroups.length > 1 ? (
        <Tabs value={activeGroup.id} onValueChange={setSelectedGroupId} syncUrl={false}>
          <TabsList aria-label="Pilih kelompok belajar">
            {initialGroups.map((group) => (
              <TabsTrigger key={group.id} value={group.id}>{group.name}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      <section className="border-y border-border/60 py-5 sm:rounded-xl sm:border sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="min-w-0 truncate font-heading text-h5 font-bold text-foreground">
                {activeGroup.name}
              </h2>
              <button
                type="button"
                onClick={openRename}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Ganti nama kelompok"
                title="Ganti nama kelompok"
              >
                <PencilLine className="size-3.5" />
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-body-xs text-muted-foreground">
              <Badge variant="outline" className="text-body-2xs">
                {activeGroup.myRole === "leader" ? "Ketua" : "Anggota"}
              </Badge>
              <span>{activeGroup.packageName}</span>
              <span>•</span>
              <span>{activeGroup.semester} {activeGroup.academicYear}</span>
            </div>
          </div>

          <Button asChild size="sm" className="shrink-0 gap-1.5">
            <Link href="/dashboard/schedule">
              <CalendarRange className="size-3.5" />
              Jadwalkan sesi
            </Link>
          </Button>
        </div>

        <div className="py-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-body-xs text-muted-foreground">Kuota paket</p>
              <p className="font-heading text-h5 font-bold text-foreground">
                {activeGroup.usedQuotaSessions}
                <span className="ml-1 text-body-sm font-normal text-muted-foreground">
                  / {activeGroup.totalQuotaSessions} sesi
                </span>
              </p>
            </div>
            <p className="text-right text-body-xs text-muted-foreground">
              <span className="block font-heading text-h5 font-bold text-brand-primary">
                {activeGroup.remainingQuota ?? Math.max(0, activeGroup.totalQuotaSessions - activeGroup.usedQuotaSessions)}
              </span>
              tersisa
            </p>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={totalPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${totalPercent}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-body-xs text-muted-foreground">
            <span>Minggu ini: {activeGroup.weeklyUsedSessions} sesi</span>
            <span>{activeGroup.frequencyLabel}</span>
          </div>
        </div>

        <div className="grid border-t border-border/50 sm:grid-cols-2">
          <div className="py-4 sm:pr-5">
            <div className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
              <CalendarDays className="size-4 text-brand-primary" />
              {activeGroup.endDate ? `Aktif sampai ${formatIsoDate(new Date(activeGroup.endDate))}` : "Satu semester penuh"}
            </div>
            <p className="mt-1 text-body-xs text-muted-foreground">
              Bergabung {formatIsoDate(new Date(activeGroup.joinedAt))}
            </p>
          </div>

          <div className="border-t border-border/50 py-4 sm:border-l sm:border-t-0 sm:pl-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body-sm font-semibold text-foreground">Anggota</p>
                <p className="truncate text-body-xs text-muted-foreground">
                  {activeGroup.members.map((member) => member.isMe ? `${member.name} (Anda)` : member.name).join(", ")}
                </p>
              </div>
              <span className="shrink-0 text-body-xs text-muted-foreground">
                {activeGroup.members.length}{activeGroup.token ? `/${activeGroup.token.capacity}` : ""}
              </span>
            </div>
          </div>
        </div>

        {activeGroup.courses.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-t border-border/50 py-4">
            {activeGroup.courses.map((course) => (
              <Badge key={course.id} variant="secondary" className="font-medium">
                {course.title}
              </Badge>
            ))}
          </div>
        ) : null}

        {activeGroup.token && activeGroup.members.length < activeGroup.token.capacity ? (
          <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-4">
            <div className="min-w-0">
              <p className="text-body-xs text-muted-foreground">Token undangan</p>
              <p className="truncate font-mono text-body-sm font-semibold text-foreground">{activeGroup.token.token}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => copyToken(activeGroup.token!.token)}
              className="shrink-0 gap-1.5"
            >
              {copiedToken === activeGroup.token.token ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              Salin
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
            <DialogTitle>Ganti nama kelompok</DialogTitle>
            <DialogDescription>Nama dapat diganti sekali tiap 30 hari.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1">
            <label htmlFor="student-group-name" className="text-body-sm font-semibold">Nama baru</label>
            <Input
              id="student-group-name"
              value={draftName}
              maxLength={80}
              disabled={statusLoading || saving || renameStatus?.canRename === false}
              onChange={(event) => setDraftName(event.target.value)}
              autoComplete="off"
            />
            {renameStatus?.canRename === false && renameStatus.nextRenameAt ? (
              <p className="text-body-xs text-muted-foreground">
                Dapat diganti lagi {formatDateTime(renameStatus.nextRenameAt)}.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={closeRename}>Batal</Button>
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
              {saving ? "Menyimpan" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
