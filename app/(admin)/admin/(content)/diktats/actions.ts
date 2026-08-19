"use server";

import { db } from "@/db";
import { diktats } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateDiktatDraft, publishDiktat, extractFileKeyFromUrl } from "@/lib/diktat-actions";
import { storage } from "@/lib/storage";

export async function createDiktatDraftAction(courseId: string, chapterIds: string[]) {
  try {
    const res = await generateDiktatDraft(courseId, chapterIds);
    if (!res.success) {
      return { success: false, error: res.errors?.join(", ") || "Gagal membuat draf diktat." };
    }
    
    // Automatically trigger PDF compilation immediately for tutor convenience
    const pubRes = await publishDiktat(res.diktatId!);
    if (!pubRes.success) {
      return { 
        success: true, 
        diktatId: res.diktatId, 
        warning: pubRes.errors?.join(", ") || "Draf tersimpan namun gagal mengompilasi PDF." 
      };
    }
    
    return { success: true, diktatId: res.diktatId, url: pubRes.fileUrl ? storage.getUrl(pubRes.fileUrl) : undefined };
  } catch (error: any) {
    console.error("Error creating diktat:", error);
    return { success: false, error: error.message || "Terjadi kesalahan sistem." };
  }
}

export async function compileDiktatAction(diktatId: string) {
  try {
    const res = await publishDiktat(diktatId);
    if (!res.success) {
      return { success: false, error: res.errors?.join(", ") || "Gagal mengompilasi PDF." };
    }
    return { success: true, url: res.fileUrl ? storage.getUrl(res.fileUrl) : undefined };
  } catch (error: any) {
    console.error("Error compiling diktat:", error);
    return { success: false, error: error.message || "Terjadi kesalahan sistem." };
  }
}

export async function deleteDiktatAction(diktatId: string) {
  try {
    const [diktat] = await db.select().from(diktats).where(eq(diktats.id, diktatId));
    if (!diktat) {
      return { success: false, error: "Diktat tidak ditemukan." };
    }
    
    if (diktat.fileUrl) {
      const fileKey = extractFileKeyFromUrl(diktat.fileUrl);
      if (fileKey) {
        try {
          await storage.delete(fileKey);
        } catch (err) {
          console.warn("Gagal menghapus file dari storage:", err);
        }
      }
    }
    
    await db.delete(diktats).where(eq(diktats.id, diktatId));
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting diktat:", error);
    return { success: false, error: error.message || "Terjadi kesalahan sistem." };
  }
}
