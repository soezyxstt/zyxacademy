import { db } from "../db";
import { aiQuestionBank } from "../db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import fs from "fs";
import path from "path";

// Load .env manually
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*["']?(.*?)["']?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  }
} catch {
  // ignore
}

async function verify() {
  console.log("=== Checking Local SQLite ===");
  const localRows = await db
    .select({ id: aiQuestionBank.id, prompt: aiQuestionBank.prompt, courseId: aiQuestionBank.courseId })
    .from(aiQuestionBank)
    .where(eq(aiQuestionBank.courseId, "tutorial-pka"));
  console.log(`Local SQLite tutorial-pka questions count: ${localRows.length}`);

  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && tursoToken) {
    console.log("\n=== Checking Production Turso ===");
    const client = createClient({ url: tursoUrl, authToken: tursoToken });
    const prodDb = drizzle(client);

    const prodRows = await prodDb
      .select({ id: aiQuestionBank.id, prompt: aiQuestionBank.prompt, courseId: aiQuestionBank.courseId })
      .from(aiQuestionBank)
      .where(eq(aiQuestionBank.courseId, "tutorial-pka"));
    console.log(`Production Turso tutorial-pka questions count: ${prodRows.length}`);
  }
}

verify().catch(console.error);
