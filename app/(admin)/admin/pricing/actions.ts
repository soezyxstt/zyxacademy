"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { discountVouchers } from "@/db/schema";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { calendarDateToJakartaInstant, isCalendarDate, normalizeDate } from "@/lib/date-utils";

export type DiscountVoucherItem = {
  id: string;
  code: string;
  discountPercent: number;
  maxQuota: number;
  usedQuota: number;
  expiresAt: Date;
  isActive: boolean;
  description: string | null;
  createdAt: Date;
};

export type ActiveDiscountVoucher = {
  id: string;
  code: string;
  discountPercent: number;
  remainingQuota: number;
  expiresAt: Date;
  description: string | null;
};

export type CreateVoucherInput = {
  code: string;
  discountPercent: number;
  maxQuota: number;
  expiresAt: string; // ISO or YYYY-MM-DD
  description?: string;
};

export type ActionResult<T = void> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Maps catch-block errors to safe user-facing error messages while preserving
 * explicit unauthorized/forbidden admin guard messages.
 */
function toSafeActionError(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    if (error.message === "Unauthorized" || error.message.includes("admin role required")) {
      return error.message;
    }
  }
  return fallbackMessage;
}

/**
 * Fetch all discount vouchers for admin management
 */
export async function getDiscountVouchers(): Promise<ActionResult<DiscountVoucherItem[]>> {
  try {
    await assertAdmin();

    const vouchers = await db
      .select()
      .from(discountVouchers)
      .orderBy(desc(discountVouchers.createdAt));

    return {
      success: true,
      data: vouchers.map((v) => ({
        id: v.id,
        code: v.code,
        discountPercent: v.discountPercent,
        maxQuota: v.maxQuota,
        usedQuota: v.usedQuota,
        expiresAt: normalizeDate(v.expiresAt),
        isActive: v.isActive,
        description: v.description,
        createdAt: normalizeDate(v.createdAt),
      })),
    };
  } catch (error) {
    console.error("[getDiscountVouchers]", error);
    return {
      success: false,
      error: toSafeActionError(error, "Gagal memuat daftar voucher."),
    };
  }
}

/**
 * Fetch active vouchers that can be applied to student custom plans
 */
export async function getActiveDiscountVouchers(): Promise<ActionResult<ActiveDiscountVoucher[]>> {
  try {
    await assertAdmin();

    const now = new Date();
    const rows = await db
      .select()
      .from(discountVouchers)
      .where(
        and(
          eq(discountVouchers.isActive, true),
          gt(discountVouchers.expiresAt, now),
          sql`${discountVouchers.usedQuota} < ${discountVouchers.maxQuota}`
        )
      )
      .orderBy(desc(discountVouchers.discountPercent));

    return {
      success: true,
      data: rows.map((v) => ({
        id: v.id,
        code: v.code,
        discountPercent: v.discountPercent,
        remainingQuota: Math.max(0, v.maxQuota - v.usedQuota),
        expiresAt: normalizeDate(v.expiresAt),
        description: v.description,
      })),
    };
  } catch (error) {
    console.error("[getActiveDiscountVouchers]", error);
    return {
      success: false,
      error: toSafeActionError(error, "Gagal memuat voucher aktif."),
    };
  }
}

/**
 * Create a new discount voucher
 */
export async function createDiscountVoucher(
  input: CreateVoucherInput
): Promise<ActionResult<DiscountVoucherItem>> {
  try {
    await assertAdmin();

    const normalizedCode = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(normalizedCode)) {
      return {
        success: false,
        error: "Kode voucher harus 3 sampai 30 karakter alfanumerik (huruf, angka, strip, garis bawah).",
      };
    }

    const discountPercent = Number(input.discountPercent);
    if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 100) {
      return {
        success: false,
        error: "Persentase diskon harus berupa bilangan bulat antara 1 dan 100.",
      };
    }

    const maxQuota = Number(input.maxQuota);
    if (!Number.isInteger(maxQuota) || maxQuota < 1) {
      return {
        success: false,
        error: "Kuota penggunaan minimal 1.",
      };
    }

    let expiresAt: Date;
    try {
      const trimmedDate = input.expiresAt.trim();
      if (isCalendarDate(trimmedDate)) {
        expiresAt = calendarDateToJakartaInstant(trimmedDate, "23:59:59.999");
      } else {
        expiresAt = new Date(input.expiresAt);
      }
    } catch {
      return {
        success: false,
        error: "Format tanggal kedaluwarsa tidak valid.",
      };
    }

    if (isNaN(expiresAt.getTime())) {
      return {
        success: false,
        error: "Format tanggal kedaluwarsa tidak valid.",
      };
    }

    if (expiresAt.getTime() <= Date.now()) {
      return {
        success: false,
        error: "Tanggal kedaluwarsa harus berada di masa depan.",
      };
    }

    const [existing] = await db
      .select({ id: discountVouchers.id })
      .from(discountVouchers)
      .where(eq(discountVouchers.code, normalizedCode))
      .limit(1);

    if (existing) {
      return {
        success: false,
        error: `Kode voucher "${normalizedCode}" sudah digunakan. Silakan gunakan kode lain.`,
      };
    }

    const newId = randomUUID();
    const [inserted] = await db
      .insert(discountVouchers)
      .values({
        id: newId,
        code: normalizedCode,
        discountPercent,
        maxQuota,
        usedQuota: 0,
        expiresAt,
        isActive: true,
        description: input.description?.trim() || null,
      })
      .returning();

    revalidatePath("/admin/pricing");

    return {
      success: true,
      data: {
        id: inserted.id,
        code: inserted.code,
        discountPercent: inserted.discountPercent,
        maxQuota: inserted.maxQuota,
        usedQuota: inserted.usedQuota,
        expiresAt: normalizeDate(inserted.expiresAt),
        isActive: inserted.isActive,
        description: inserted.description,
        createdAt: normalizeDate(inserted.createdAt),
      },
    };
  } catch (error) {
    console.error("[createDiscountVoucher]", error);
    return {
      success: false,
      error: toSafeActionError(error, "Gagal membuat voucher baru."),
    };
  }
}

/**
 * Toggle active status of a discount voucher
 */
export async function toggleDiscountVoucherStatus(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  try {
    await assertAdmin();

    await db
      .update(discountVouchers)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(discountVouchers.id, id));

    revalidatePath("/admin/pricing");
    return { success: true };
  } catch (error) {
    console.error("[toggleDiscountVoucherStatus]", error);
    return {
      success: false,
      error: toSafeActionError(error, "Gagal mengubah status voucher."),
    };
  }
}

/**
 * Delete a discount voucher
 */
export async function deleteDiscountVoucher(id: string): Promise<ActionResult> {
  try {
    await assertAdmin();

    await db.delete(discountVouchers).where(eq(discountVouchers.id, id));

    revalidatePath("/admin/pricing");
    return { success: true };
  } catch (error) {
    console.error("[deleteDiscountVoucher]", error);
    return {
      success: false,
      error: toSafeActionError(error, "Gagal menghapus voucher."),
    };
  }
}
