"use client";

import { useRef, useState, useTransition } from "react";
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
import { useTranslations, useAppLocale } from "@/lib/i18n/client";

export type RenameableStudentGroup = {
  id: string;
  name: string;
  isLeader?: boolean;
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

export function StudentGroupRenamePanel({
  groups,
}: {
  groups: RenameableStudentGroup[];
}) {
  const t = useTranslations("student");
  const { locale } = useAppLocale();
  const router = useRouter();
  const [selected, setSelected] = useState<RenameableStudentGroup | null>(null);
  const [draftName, setDraftName] = useState("");
  const [status, setStatus] = useState<RenameStatus>(null);
  const [statusLoading, startStatusTransition] = useTransition();
  const [saving, startSaveTransition] = useTransition();
  const statusRequest = useRef(0);

  if (groups.length === 0) return null;

  const closeRename = () => {
    statusRequest.current += 1;
    setSelected(null);
  };

  const openRename = (group: RenameableStudentGroup) => {
    const requestId = ++statusRequest.current;
    setSelected(group);
    setDraftName(group.name);
    setStatus(null);
    startStatusTransition(async () => {
      const result = await getGroupRenameStatus(group.id);
      if (requestId !== statusRequest.current) return;

      if (!result.success) {
        toast.error(t("groups.renameFailed"));
        closeRename();
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
    const selectedGroupId = selected.id;

    startSaveTransition(async () => {
      const result = await renameStudentGroup(selectedGroupId, draftName);
      if (!result.success) {
        const cooldown =
          "nextRenameAt" in result && result.nextRenameAt
            ? ` ${t("groups.cooldownUntil", { date: formatDateTime(result.nextRenameAt, locale) })}`
            : "";
        toast.error(`${t("groups.renameFailed")}${cooldown}`);
        if (
          selected?.id === selectedGroupId &&
          "nextRenameAt" in result &&
          result.nextRenameAt
        ) {
          setStatus({ canRename: false, nextRenameAt: result.nextRenameAt });
        }
        return;
      }

      if (result.changed) {
        toast.success(t("groups.renameSuccess"));
      }
      if (selected?.id === selectedGroupId) {
        closeRename();
      }
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
            {groups.length > 1 ? t("groups.renameNamed", { name: group.name }) : t("groups.renameOne")}
          </Button>
        ))}
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !saving) closeRename();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("groups.rename")}</DialogTitle>
            <DialogDescription>
              {t("groups.visibility")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <label htmlFor="student-group-name" className="text-sm font-medium">
                {t("groups.newName")}
              </label>
              <Input
                id="student-group-name"
                value={draftName}
                maxLength={80}
                disabled={statusLoading || saving || status?.canRename === false}
                onChange={(event) => setDraftName(event.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">{t("groups.length")}</p>
            </div>

            <div className="flex gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">{t("groups.confirmation")}</p>
                <p className="text-muted-foreground">
                  {t("groups.cooldown")}
                </p>
                {status?.canRename === false && status.nextRenameAt ? (
                  <p className="font-medium text-foreground">
                    {t("groups.cooldownUntil", { date: formatDateTime(status.nextRenameAt, locale) })}
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
              onClick={closeRename}
            >
              {t("groups.cancel")}
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
              {saving ? t("groups.saving") : t("groups.confirmRename")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
