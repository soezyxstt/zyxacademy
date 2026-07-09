import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { db } from "../db";
import { courses } from "../db/schema";
import { eq } from "drizzle-orm";

async function main() {
  // ID course Matematika I dari log importir sebelumnya
  const courseId = "859115fb-84e6-4e10-82d1-fecc22afe783"; 
  console.log(`Memulai proses penghapusan kursus ID: ${courseId}...`);

  try {
    await db.delete(courses).where(eq(courses.id, courseId));
    console.log("SUCCESS: Kursus dan seluruh data terkait (chapters, KOs, website materials, flashcards, dll.) berhasil dihapus!");
    process.exit(0);
  } catch (error) {
    console.error("FAIL: Gagal menghapus kursus:", error);
    process.exit(1);
  }
}

main();
