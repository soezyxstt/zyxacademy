"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { courses, chapters, courseMaterials } from "@/db/schema";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { eq, asc, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { storage } from "@/lib/storage";
import { joinKey, slugifySegment, userFileLeaf } from "@/lib/storage/keys";

export async function getCourses() {
  await assertAdmin();
  return db.select().from(courses);
}

const allowedCategories = [
  "Matematika",
  "Fisika",
  "Astronomi",
  "Kimia",
  "Aktuaria",
  "Mikrobiologi",
  "Biologi",
  "Rekayasa Hayati",
  "Rekayasa Pertanian",
  "Rekayasa Kehutanan",
  "Teknologi Pasca Panen",
  "Sains dan Teknologi Farmasi",
  "Farmasi Klinik dan Komunitas",
  "Teknik Pertambangan",
  "Teknik Perminyakan",
  "Teknik Geofisika",
  "Teknik Metalurgi",
  "Teknik Geologi",
  "Meteorologi",
  "Oseanografi",
  "Teknik Geodesi dan Geomatika",
  "Teknik Kimia",
  "Teknik Fisika",
  "Teknik Industri",
  "Teknik Pangan",
  "Manajemen Rekayasa",
  "Teknik Bioenergi dan Kemurgi",
  "Teknik Industri (Kampus Cirebon)",
  "Teknik Elektro",
  "Teknik Informatika",
  "Teknik Tenaga Listrik",
  "Teknik Telekomunikasi",
  "Sistem dan Teknologi Informasi",
  "Teknik Biomedis",
  "Teknik Mesin",
  "Teknik Dirgantara",
  "Teknik Material",
  "Teknik Sipil",
  "Teknik Lingkungan",
  "Teknik Kelautan",
  "Rekayasa Infrastruktur Lingkungan",
  "Teknik dan Pengelolaan Sumber Daya Air",
  "Arsitektur",
  "Perencanaan Wilayah dan Kota",
  "Perencanaan Wilayah dan Kota (Kampus Cirebon)",
  "Seni Rupa",
  "Kriya (Kampus Cirebon)",
  "Kriya",
  "Desain Interior",
  "Desain Komunikasi Visual",
  "Desain Produk",
  "Manajemen",
  "Kewirausahaan",
  "TPB",
  "Rekayasa Umum",
] as const;

type Category = typeof allowedCategories[number];

export async function saveCourse(
  id: string,
  title: string,
  category: string,
  description: string | null,
  isNew: boolean
) {
  await assertAdmin();

  const cleanId = id.trim().toLowerCase();
  const cleanTitle = title.trim();
  const cleanCategory = category.trim();
  const cleanDesc = description?.trim() || null;

  if (!cleanId || !/^[a-z0-9-]+$/.test(cleanId)) {
    return { success: false, error: "ID Mata Kuliah harus alfanumerik huruf kecil dan strip (slug)" };
  }
  if (!cleanTitle) {
    return { success: false, error: "Nama mata kuliah tidak boleh kosong" };
  }
  if (!cleanCategory) {
    return { success: false, error: "Kategori tidak boleh kosong" };
  }
  if (!(allowedCategories as readonly string[]).includes(cleanCategory)) {
    return { success: false, error: "Kategori tidak valid. Pilih dari daftar yang tersedia." };
  }

  try {
    if (isNew) {
      const existing = await db.query.courses.findFirst({
        where: eq(courses.id, cleanId),
      });
      if (existing) {
        return { success: false, error: "ID Mata Kuliah sudah terdaftar" };
      }
      await db.insert(courses).values({
        id: cleanId,
        title: cleanTitle,
        category: cleanCategory as Category,
        description: cleanDesc,
      });
    } else {
      await db
        .update(courses)
        .set({
          title: cleanTitle,
          category: cleanCategory as Category,
          description: cleanDesc,
        })
        .where(eq(courses.id, cleanId));
    }

    revalidatePath("/admin/courses");
    revalidatePath("/courses");
    revalidatePath(`/courses/${cleanId}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to save course:", err);
    return { success: false, error: "Terjadi kesalahan saat menyimpan mata kuliah" };
  }
}

export async function deleteCourse(id: string) {
  await assertAdmin();

  try {
    await db.delete(courses).where(eq(courses.id, id));

    revalidatePath("/admin/courses");
    revalidatePath("/courses");
    revalidatePath(`/courses/${id}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to delete course:", err);
    return { success: false, error: "Gagal menghapus mata kuliah. Pastikan tidak ada data terkait." };
  }
}

// Chapter Management Server Actions
export async function getCourseChapters(courseId: string) {
  await assertAdmin();
  return db
    .select()
    .from(chapters)
    .where(eq(chapters.courseId, courseId))
    .orderBy(asc(chapters.orderIndex));
}

export async function getAllChapters() {
  await assertAdmin();
  return db
    .select()
    .from(chapters)
    .orderBy(asc(chapters.orderIndex));
}

export async function saveChapter(
  id: string | null,
  courseId: string,
  title: string,
  orderIndex: number,
  description?: string | null
) {
  await assertAdmin();

  const cleanTitle = title.trim();
  const cleanDesc = description?.trim() || null;

  if (!cleanTitle) {
    return { success: false, error: "Judul bab tidak boleh kosong" };
  }

  try {
    if (!id) {
      const newId = randomUUID();
      await db.insert(chapters).values({
        id: newId,
        courseId,
        title: cleanTitle,
        orderIndex,
        description: cleanDesc,
        status: "published",
      });
      revalidatePath("/admin/courses");
      revalidatePath(`/courses/${courseId}/material`);
      return { success: true, chapter: { id: newId, courseId, title: cleanTitle, orderIndex, description: cleanDesc } };
    } else {
      await db
        .update(chapters)
        .set({
          title: cleanTitle,
          orderIndex,
          description: cleanDesc,
        })
        .where(eq(chapters.id, id));
    }

    revalidatePath("/admin/courses");
    revalidatePath(`/courses/${courseId}/material`);
    return { success: true };
  } catch (err: any) {
    console.error("Failed to save chapter:", err);
    return { success: false, error: err.message || "Gagal menyimpan bab" };
  }
}

export async function deleteChapter(id: string) {
  await assertAdmin();

  try {
    const [existing] = await db.select().from(chapters).where(eq(chapters.id, id)).limit(1);
    if (!existing) {
      return { success: false, error: "Bab tidak ditemukan" };
    }

    await db.delete(chapters).where(eq(chapters.id, id));

    revalidatePath("/admin/courses");
    revalidatePath(`/courses/${existing.courseId}/material`);
    return { success: true };
  } catch (err: any) {
    console.error("Failed to delete chapter:", err);
    return { success: false, error: "Gagal menghapus bab. Pastikan tidak ada data terkait." };
  }
}

// PDF Course Materials Server Actions
export async function getUploadedMaterials(courseId?: string) {
  await assertAdmin();
  
  if (courseId) {
    return db
      .select()
      .from(courseMaterials)
      .where(eq(courseMaterials.courseId, courseId))
      .orderBy(desc(courseMaterials.createdAt));
  } else {
    return db
      .select()
      .from(courseMaterials)
      .orderBy(desc(courseMaterials.createdAt));
  }
}

export async function uploadCourseMaterial(
  courseId: string,
  title: string,
  type: "materi_kelas" | "contoh_soal",
  chapterIds: string[],
  fileData: { bufferBase64: string; name: string; type: string }
) {
  await assertAdmin();

  if (!courseId || !title || !type || !chapterIds || chapterIds.length === 0 || !fileData) {
    return { success: false, error: "Semua field wajib diisi" };
  }

  try {
    const fileBuffer = Buffer.from(fileData.bufferBase64, "base64");
    const r2Key = joinKey(
      "courses",
      slugifySegment(courseId),
      "materials",
      userFileLeaf(fileData.name)
    );
    
    const uploadRes = await storage.upload(fileBuffer, r2Key, fileData.type);
    
    const materialId = randomUUID();
    
    await db.insert(courseMaterials).values({
      id: materialId,
      courseId,
      title: title.trim(),
      type,
      fileUrl: uploadRes.key,
      chapterIds,
    });

    revalidatePath("/admin/courses");
    revalidatePath(`/courses/${courseId}/material`);
    return { success: true };
  } catch (err: any) {
    console.error("Failed to upload course material:", err);
    return { success: false, error: err.message || "Gagal mengunggah materi" };
  }
}

export async function deleteCourseMaterial(id: string) {
  await assertAdmin();

  try {
    const [existing] = await db
      .select()
      .from(courseMaterials)
      .where(eq(courseMaterials.id, id))
      .limit(1);

    if (!existing) {
      return { success: false, error: "Materi tidak ditemukan" };
    }

    if (existing.fileUrl) {
      await storage.delete(existing.fileUrl).catch((e) => {
        console.error("Failed to delete from R2:", e);
      });
    }

    await db.delete(courseMaterials).where(eq(courseMaterials.id, id));

    revalidatePath("/admin/courses");
    revalidatePath(`/courses/${existing.courseId}/material`);
    return { success: true };
  } catch (err: any) {
    console.error("Failed to delete course material:", err);
    return { success: false, error: err.message || "Gagal menghapus materi" };
  }
}
