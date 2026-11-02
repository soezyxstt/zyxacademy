"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Tag,
  Ticket,
  Trash2,
} from "lucide-react";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/state-panels";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { daysFrom, formatIsoDateUtc } from "@/lib/date-utils";
import {
  createDiscountVoucher,
  deleteDiscountVoucher,
  getDiscountVouchers,
  toggleDiscountVoucherStatus,
  type DiscountVoucherItem,
} from "@/app/(admin)/admin/pricing/actions";

function getDefaultExpiryDate(): string {
  return formatIsoDateUtc(daysFrom(30));
}

export function VoucherManagementTab({
  onVouchersUpdated,
}: {
  onVouchersUpdated?: () => void;
}) {
  const t = useTranslations("adminMedia");
  const [vouchers, setVouchers] = useState<DiscountVoucherItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Create form state
  const [code, setCode] = useState("");
  const [discountPercent, setDiscountPercent] = useState("10");
  const [maxQuota, setMaxQuota] = useState("10");
  const [expiresAt, setExpiresAt] = useState(getDefaultExpiryDate());
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<DiscountVoucherItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Mutation error state
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getDiscountVouchers();
    if (res.success && res.data) {
      setLoadedAt(Date.now());
      setVouchers(res.data);
    } else {
      setError(t("voucher.loadError"));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  const handleCreateVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setActionError(null);

    startTransition(async () => {
      const res = await createDiscountVoucher({
        code,
        discountPercent: Number(discountPercent),
        maxQuota: Number(maxQuota),
        expiresAt,
        description: description || undefined,
      });

      if (res.success && res.data) {
        setFormSuccess(t("voucher.created", { code: res.data.code }));
        setCode("");
        setDescription("");
        setDiscountPercent("10");
        setMaxQuota("10");
        setExpiresAt(getDefaultExpiryDate());
        setShowForm(false);
        fetchVouchers();
        onVouchersUpdated?.();
      } else {
        setFormError(t("voucher.createError"));
      }
    });
  };

  const handleToggleStatus = (voucher: DiscountVoucherItem) => {
    setActionError(null);
    setFormSuccess(null);

    startTransition(async () => {
      const res = await toggleDiscountVoucherStatus(voucher.id, !voucher.isActive);
      if (res.success) {
        fetchVouchers();
        onVouchersUpdated?.();
      } else {
        setActionError(t("voucher.statusError"));
      }
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setActionError(null);
    setIsDeleting(true);

    const res = await deleteDiscountVoucher(deleteTarget.id);
    setIsDeleting(false);

    if (res.success) {
      setDeleteTarget(null);
      fetchVouchers();
      onVouchersUpdated?.();
    } else {
      setDeleteError(t("voucher.deleteError"));
      setActionError(t("voucher.deleteError"));
    }
  };

  const isExpired = (date: Date) => new Date(date).getTime() <= loadedAt;

  return (
    <div className="space-y-6" data-voucher-management>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-body-base font-bold text-foreground">
            {t("voucher.title")}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchVouchers}
            disabled={loading || isPending}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("voucher.refresh")}
          </Button>

          <Button
            type="button"
            variant={showForm ? "secondary" : "default"}
            size="sm"
            onClick={() => {
              setShowForm(!showForm);
              setFormError(null);
              setFormSuccess(null);
            }}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            {showForm ? t("voucher.closeForm") : t("voucher.create")}
          </Button>
        </div>
      </div>

      {formSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-status-success/30 bg-status-success/10 p-3 text-body-xs text-status-success">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{formSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-body-xs text-status-error">
          <AlertCircle className="size-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {showForm && (
        <section className="rounded-xl border border-border bg-card p-4">
          <AdminSectionTitle
            icon={Tag}
            title={t("voucher.new")}
          />

          <form onSubmit={handleCreateVoucher} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="voucher-code">{t("voucher.code")}</Label>
                <Input
                  id="voucher-code"
                  type="text"
                  placeholder={t("voucher.codePlaceholder")}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                  className="font-mono uppercase tracking-wider"
                />
                <p className="text-body-xs text-muted-foreground">
                  {t("voucher.codeHelp")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="voucher-discount">{t("voucher.discount")}</Label>
                <Input
                  id="voucher-discount"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  required
                />
                <p className="text-body-xs text-muted-foreground">
                  {t("voucher.discountHelp")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="voucher-quota">{t("voucher.quota")}</Label>
                <Input
                  id="voucher-quota"
                  type="number"
                  min={1}
                  step={1}
                  value={maxQuota}
                  onChange={(e) => setMaxQuota(e.target.value)}
                  required
                />
                <p className="text-body-xs text-muted-foreground">
                  {t("voucher.quotaHelp")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="voucher-expiry">{t("voucher.expiry")}</Label>
                <Input
                  id="voucher-expiry"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="voucher-desc">{t("voucher.description")}</Label>
              <Input
                id="voucher-desc"
                type="text"
                placeholder={t("voucher.descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {formError && (
              <div className="flex items-center gap-2 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-body-xs text-status-error">
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
                disabled={isPending}
              >
                {t("voucher.cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={isPending} className="gap-1.5">
                {isPending && <Loader2 className="size-3.5 animate-spin" />}
                {t("voucher.save")}
              </Button>
            </div>
          </form>
        </section>
      )}

      {error ? (
        <AdminErrorState message={error} onRetry={fetchVouchers} />
      ) : loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : vouchers.length === 0 ? (
        <AdminEmptyState
          icon={Ticket}
          title={t("voucher.empty")}
          description={t("voucher.emptyHelp")}
          action={
            <Button
              type="button"
              size="sm"
              onClick={() => setShowForm(true)}
              className="mt-2 gap-1.5"
            >
              <Plus className="size-3.5" />
              {t("voucher.createFirst")}
            </Button>
          }
        />
      ) : (
        <AdminTable>
          <table className="w-full text-left text-body-xs">
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 font-semibold text-foreground">{t("voucher.codeColumn")}</th>
                <th className="px-4 py-3 font-semibold text-foreground">{t("voucher.discountColumn")}</th>
                <th className="px-4 py-3 font-semibold text-foreground">{t("voucher.quotaColumn")}</th>
                <th className="px-4 py-3 font-semibold text-foreground">{t("voucher.activePeriod")}</th>
                <th className="px-4 py-3 font-semibold text-foreground">{t("voucher.status")}</th>
                <th className="px-4 py-3 text-right font-semibold text-foreground">{t("voucher.actions")}</th>
              </tr>
            </AdminTableHead>
            <tbody className="divide-y divide-border/60">
              {vouchers.map((v) => {
                const expired = isExpired(v.expiresAt);
                const exhausted = v.usedQuota >= v.maxQuota;

                return (
                  <tr key={v.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-mono text-body-sm font-bold text-foreground">
                          {v.code}
                        </span>
                        {v.description && (
                          <span className="text-body-xs text-muted-foreground">
                            {v.description}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className="border-[var(--zx-accent)]/30 bg-[var(--zx-accent)]/10 font-bold text-[var(--zx-accent)]"
                      >
                        {v.discountPercent}%
                      </Badge>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-semibold ${
                            exhausted ? "text-status-warning" : "text-foreground"
                          }`}
                        >
                          {v.usedQuota} / {v.maxQuota}
                        </span>
                        <span className="text-body-xs text-muted-foreground">
                          {t("voucher.remaining", { count: Math.max(0, v.maxQuota - v.usedQuota) })}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className={expired ? "font-semibold text-status-error" : "text-foreground"}>
                          <FormattedDate
                            date={v.expiresAt}
                            options={{ dateStyle: "medium" }}
                          />
                        </span>
                        {expired && (
                          <span className="text-body-2xs text-status-error">{t("voucher.expired")}</span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {expired ? (
                        <Badge variant="outline" className="border-status-error/30 bg-status-error/10 text-status-error">
                          {t("voucher.expired")}
                        </Badge>
                      ) : exhausted ? (
                        <Badge variant="outline" className="border-status-warning/30 bg-status-warning/10 text-status-warning">
                          {t("voucher.quotaUsed")}
                        </Badge>
                      ) : v.isActive ? (
                        <Badge variant="outline" className="border-status-success/30 bg-status-success/10 text-status-success">
                          {t("voucher.active")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                          {t("voucher.inactive")}
                        </Badge>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => handleToggleStatus(v)}
                          disabled={isPending}
                          title={v.isActive ? t("voucher.disable") : t("voucher.enable")}
                          className="h-7 px-2 text-body-2xs gap-1"
                        >
                          <Power className="size-3" />
                          {v.isActive ? t("voucher.disableAction") : t("voucher.enableAction")}
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setDeleteTarget(v)}
                          disabled={isPending}
                          title={t("voucher.delete")}
                          className="text-status-error hover:bg-status-error/10"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AdminTable>
      )}

      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        title={t("voucher.delete")}
        description={
          deleteTarget ? (
            <span className="block space-y-2">
              <span className="block">
                {t("voucher.deleteDescription", { code: deleteTarget.code })}
              </span>
              {deleteError && (
                <span className="block rounded-md border border-status-error/30 bg-status-error/10 p-2 text-body-xs font-medium text-status-error">
                  {deleteError}
                </span>
              )}
            </span>
          ) : (
            ""
          )
        }
        confirmLabel={t("voucher.confirmDelete")}
        cancelLabel={t("voucher.cancel")}
        destructive
        loading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
