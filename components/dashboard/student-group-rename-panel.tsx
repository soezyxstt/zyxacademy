"use client";

import { useState, useTransition } from "react";
import { PencilLine, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  getGroupRenameStatus,
  renameStudentGroup,
} from "@/app/(student)/dashboard/groups/rename-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export type RenameableStudentGroup = {
  id: string;
  name: string;
  isLeader?: boolean;
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

export function StudentGroupRenamePanel({
  groups,
}: {
  groups: RenameableStudentGroup[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<RenameableStudentGroup | null>(null);
  const [draftName, setDraftName] = useState("");
  const [status, setStatus] = useState<RenameStatus>(null);
  const [statusLoading, startStatusTransition] = useTransition();
  const [saving, startSaveTransition] = useTransition();

  if (groups.length === 0) return null;

  const openRename = (group: RenameableStudentGroup) => {
    setSelected(group);
    setDraftName(group.name);
    setStatus(null);
    startStatusTransition(async () => {
      const result = await getGroupRenameStatus(group.id);
      if (!result.success) {
        toast.error(result.error);
        setSelected(null);
        return;
      }
      setDraftName(result.currentName);
      setStatus({
        canRename: result.canRename,
        nextRenameAt: result.nextRenameAt,
      });
    });
  };

  const submitRename = () => {
    if (!selected) return;

    startSaveTransition(async () => {
      const result = await renameStudentGroup(selected.id, draftName);
      if (!result.success) {
        const cooldown =
          "nextRenameAt" in result && result.nextRenameAt
            ? ` Nama dapat diganti lagi ${formatDateTime(result.nextRenameAt)}.`
            : "";
        toast.error(`${result.error}${cooldown}`);
        if ("nextRenameAt" in result && result.nextRenameAt) {
          setStatus({ canRename: false, nextRenameAt: result.nextRenameAt });
        }
        return;
      }

      if (result.changed) {
        toast.success("Nama kelompok berhasil diganti.");
      }
      setSelected(null);
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {groups.map((group) => (
          <Button
            key={group.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => openRename(group)}
          >
            <PencilLine className="h-4 w-4" />
            Ubah nama {groups.length > 1 ? group.name : "kelompok"}
          </Button>
        ))}
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ganti nama kelompok</DialogTitle>
            <DialogDescription>
              Nama ini terlihat oleh semua anggota, tutor, dan admin. Setiap anggota kelompok dapat mengubahnya.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <label htmlFor="student-group-name" className="text-sm font-medium">
                Nama baru
              </label>
              <Input
                id="student-group-name"
                value={draftName}
                maxLength={80}
                disabled={statusLoading || saving || status?.canRename === false}
                onChange={(event) => setDraftName(event.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">3–80 karakter.</p>
            </div>

            <div className="flex gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">Konfirmasi perubahan</p>
                <p className="text-muted-foreground">
                  Setelah nama diganti, seluruh kelompok tidak dapat mengganti nama lagi selama 30 hari.
                </p>
                {status?.canRename === false && status.nextRenameAt ? (
                  <p className="font-medium text-foreground">
                    Dapat diganti lagi {formatDateTime(status.nextRenameAt)}.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setSelected(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              disabled={
                statusLoading ||
                saving ||
                status?.canRename !== true ||
                draftName.trim() === selected?.name.trim()
              }
              onClick={submitRename}
            >
              {saving ? "Menyimpan..." : "Konfirmasi & ganti nama"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
