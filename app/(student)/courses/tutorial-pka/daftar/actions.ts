"use server";

import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { pkaRegistrations } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { storage } from "@/lib/storage";
import { joinKey, slugifySegment, userFileLeaf } from "@/lib/storage/keys";
import { ensurePkaEnrollment, isPkaEnrolled } from "@/lib/pka-enrollment";

export interface PkaRegisterState {
  success?: boolean;
  error?: string;
}

const MAX_PROOF_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalize an Instagram handle: drop a leading @ and any profile URL wrapper. */
function normalizeInstagram(raw: string): string {
  let handle = raw.trim();
  const urlMatch = handle.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) handle = urlMatch[1];
  return handle.replace(/^@+/, "").trim();
}

export async function registerPkaAction(
  _prev: PkaRegisterState,
  formData: FormData,
): Promise<PkaRegisterState> {
  try {
    if (env.FEATURE_PKA !== "1") {
      return { error: "Pendaftaran Tutorial PKA sedang tidak aktif." };
    }

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return { error: "Sesi kamu berakhir. Masuk ulang lalu coba lagi." };
    }
    const userId = session.user.id;

    // Idempotent: an already-enrolled student does not re-submit.
    if (await isPkaEnrolled(userId)) {
      return { success: true };
    }

    const fullName = formData.get("fullName")?.toString().trim() ?? "";
    const faculty = formData.get("faculty")?.toString().trim() ?? "";
    const useCentralEmailPreferences = env.FEATURE_NOTIFICATION_PREFERENCES === "1";
    const emailRaw = useCentralEmailPreferences
      ? session.user.email?.trim() ?? ""
      : formData.get("email")?.toString().trim() ?? "";
    const instagramRaw = formData.get("instagram")?.toString() ?? "";
    const receiveAnnouncements = useCentralEmailPreferences || formData.get("receiveAnnouncements") === "on";
    const proof = formData.get("proof");

    if (!fullName) return { error: "Nama lengkap wajib diisi." };
    if (!faculty) return { error: "Fakultas wajib diisi." };
    if (!EMAIL_RE.test(emailRaw)) return { error: "Format email tidak valid." };

    const instagram = normalizeInstagram(instagramRaw);
    if (!instagram) return { error: "Username Instagram wajib diisi." };

    if (!(proof instanceof File) || proof.size === 0) {
      return { error: "Unggah screenshot bukti follow @zyx_academy." };
    }
    if (!ALLOWED_PROOF_TYPES.includes(proof.type)) {
      return { error: "Bukti harus berupa gambar (JPG, PNG, atau WEBP)." };
    }
    if (proof.size > MAX_PROOF_BYTES) {
      return { error: "Ukuran gambar maksimal 5 MB." };
    }

    const safeName = (proof.name || "proof.jpg").replace(/\s+/g, "_");
    const key = joinKey("pka", slugifySegment(userId), "proofs", userFileLeaf(proof.name));
    const uploaded = await storage.upload(proof, safeName, proof.type, { key });

    await db.insert(pkaRegistrations).values({
      id: randomUUID(),
      userId,
      fullName,
      faculty,
      email: emailRaw,
      instagramUsername: instagram,
      proofKey: uploaded.key,
      receiveAnnouncements,
      // Pass an explicit Date: the schema's `defaultNow()` writes milliseconds
      // while `mode:"timestamp"` reads seconds, which corrupts the stored date.
      createdAt: new Date(),
    });

    // Create the enrollment (and send catch-up broadcasts only if opted in).
    await ensurePkaEnrollment(userId, receiveAnnouncements);

    return { success: true };
  } catch (err) {
    console.error("[registerPkaAction]", err);
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi." };
  }
}
