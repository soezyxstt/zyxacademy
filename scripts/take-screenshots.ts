import "dotenv/config";
import crypto, { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn, ChildProcess } from "node:child_process";
import http from "node:http";
import puppeteer from "puppeteer";
import { db } from "@/db";
import { user as userTable, session as sessionTable, courses as coursesTable, enrollments as enrollmentsTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { resolveAuthSecret } from "@/lib/auth-secret";

const STUDENT_USER_ID = "screenshot-test-student";
const STUDENT_EMAIL = "screenshot-student@example.com";
const STUDENT_TOKEN = "student-session-token";

const ADMIN_USER_ID = "screenshot-test-admin";
const ADMIN_EMAIL = "screenshot-admin@example.com";
const ADMIN_TOKEN = "admin-session-token";

const TARGET_PORT = 3000;
const BASE_URL = `http://localhost:${TARGET_PORT}`;

const publicRoutes = [
  { path: "/", name: "01_public_landing" },
  { path: "/sign-in", name: "02_public_sign_in" },
  { path: "/sign-up", name: "03_public_sign_up" },
];

const studentRoutes = [
  { path: "/dashboard", name: "04_student_dashboard" },
  { path: "/courses", name: "05_student_courses_catalog" },
  { path: "/courses/calc-1", name: "06_student_course_calc1" },
  { path: "/courses/calc-1/material/m-calc-intro", name: "07_student_material_article" },
  { path: "/courses/calc-1/material/m-calc-limit-slide", name: "08_student_material_pdf" },
  { path: "/courses/calc-1/quiz/quiz-calc-w1", name: "09_student_quiz" },
  { path: "/courses/calc-1/flashcard", name: "10_student_flashcard" },
  { path: "/courses/calc-1/leaderboard", name: "11_student_course_leaderboard" },
  { path: "/courses/calc-1/live", name: "12_student_course_live" },
  { path: "/courses/calc-1/mastery", name: "13_student_course_mastery" },
  { path: "/courses/calc-1/path", name: "14_student_course_path" },
  { path: "/courses/calc-1/my-results", name: "15_student_course_results" },
  { path: "/profile", name: "16_student_profile" },
  { path: "/settings", name: "17_student_settings" },
  { path: "/leaderboard", name: "18_student_leaderboard_global" },
  { path: "/plans", name: "19_student_plans" },
  { path: "/calendar", name: "20_student_calendar" },
  { path: "/feedback", name: "21_student_feedback" },
  { path: "/testimonial", name: "22_student_testimonial" },
  { path: "/about", name: "23_student_about" },
  { path: "/tutor", name: "24_student_tutor" }
];

const adminRoutes = [
  { path: "/admin", name: "25_admin_home" },
  { path: "/admin/courses", name: "26_admin_courses" },
  { path: "/admin/media", name: "27_admin_media" },
  { path: "/admin/tokens", name: "28_admin_tokens" },
  { path: "/admin/ai", name: "29_admin_ai" },
  { path: "/admin/ops", name: "30_admin_ops" },
  { path: "/admin/notifications", name: "31_admin_notifications" }
];

async function seedDatabase() {
  console.log("Seeding test users, courses, and sessions...");

  // 1. Ensure courses calc-1 and physics-1 exist
  const coursesToEnsure = [
    { id: "calc-1", title: "Kalkulus I", category: "Matematika" as const, description: "Pendahuluan limit, turunan, dan integral." },
    { id: "physics-1", title: "Fisika Dasar I", category: "Fisika" as const, description: "Mekanika, kinematika, dan termodinamika." }
  ];

  for (const c of coursesToEnsure) {
    const existing = await db.query.courses.findFirst({
      where: eq(coursesTable.id, c.id)
    });
    if (!existing) {
      await db.insert(coursesTable).values(c);
      console.log(`Created course: ${c.id}`);
    }
  }

  // 2. Ensure users exist
  const student = await db.query.user.findFirst({
    where: eq(userTable.id, STUDENT_USER_ID)
  });
  if (!student) {
    await db.insert(userTable).values({
      id: STUDENT_USER_ID,
      name: "Screenshot Student",
      email: STUDENT_EMAIL,
      role: "student",
      emailVerified: true,
    });
    console.log("Created student user");
  }

  const admin = await db.query.user.findFirst({
    where: eq(userTable.id, ADMIN_USER_ID)
  });
  if (!admin) {
    await db.insert(userTable).values({
      id: ADMIN_USER_ID,
      name: "Screenshot Admin",
      email: ADMIN_EMAIL,
      role: "admin",
      emailVerified: true,
    });
    console.log("Created admin user");
  }

  // 3. Ensure enrollments
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30); // 30 days
  for (const c of coursesToEnsure) {
    const existing = await db.query.enrollments.findFirst({
      where: and(
        eq(enrollmentsTable.userId, STUDENT_USER_ID),
        eq(enrollmentsTable.courseId, c.id)
      )
    });
    if (!existing) {
      await db.insert(enrollmentsTable).values({
        id: randomUUID(),
        userId: STUDENT_USER_ID,
        courseId: c.id,
        expiresAt
      });
      console.log(`Enrolled student in ${c.id}`);
    }
  }

  // 4. Ensure sessions are active and mapped to the right tokens
  const sessionsToEnsure = [
    { id: "student-session", userId: STUDENT_USER_ID, token: STUDENT_TOKEN },
    { id: "admin-session", userId: ADMIN_USER_ID, token: ADMIN_TOKEN }
  ];

  for (const s of sessionsToEnsure) {
    const existing = await db.query.session.findFirst({
      where: eq(sessionTable.id, s.id)
    });
    if (existing) {
      await db.update(sessionTable).set({
        token: s.token,
        expiresAt,
        userId: s.userId
      }).where(eq(sessionTable.id, s.id));
    } else {
      await db.insert(sessionTable).values({
        id: s.id,
        token: s.token,
        userId: s.userId,
        expiresAt,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  console.log("Database seeding completed successfully.");
}

function isServerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(BASE_URL, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 302 || res.statusCode === 404);
    });
    req.on("error", () => {
      resolve(false);
    });
    req.end();
  });
}

async function waitForServer(): Promise<ChildProcess | null> {
  console.log("Checking if local Next.js server is running...");
  let running = await isServerRunning();
  if (running) {
    console.log("Next.js server is already running!");
    return null;
  }

  console.log("Next.js server is not running. Starting 'bun run dev'...");
  const child = spawn("bun", ["run", "dev"], {
    stdio: "inherit",
    shell: true
  });

  // Wait for server to become responsive
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    running = await isServerRunning();
    if (running) {
      console.log("Next.js server has started successfully!");
      return child;
    }
  }

  throw new Error("Timeout waiting for Next.js server to start.");
}

async function captureScreenshots() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const screenshotDir = path.join(process.cwd(), "screenshots");
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  // Helper function to capture a path
  const capture = async (routePath: string, filename: string, token?: string) => {
    const url = `${BASE_URL}${routePath}`;
    console.log(`Visiting ${url} (saving to ${filename})...`);

    // Reset cookies
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');

    if (token) {
      const secret = resolveAuthSecret();
      const signature = crypto
        .createHmac("sha256", secret)
        .update(token)
        .digest("base64");
      const signedValue = `${token}.${signature}`;

      await page.setCookie({
        name: "better-auth.session_token",
        value: signedValue,
        url: BASE_URL,
      });
    }

    try {
      await page.goto(url, { waitUntil: "load", timeout: 15000 });
      // Wait for any animations, API loads, or transitions
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err: any) {
      console.warn(`⚠️ Warning/Timeout visiting ${url}: ${err.message}`);
    }

    try {
      const currentUrl = page.url();
      const cookies = await page.cookies();
      console.log(`[Debug] Current URL: ${currentUrl}`);
      console.log(`[Debug] Active cookies:`, JSON.stringify(cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain }))));

      await page.screenshot({ path: path.join(screenshotDir, `${filename}.png`), fullPage: false });
      console.log(`✅ Captured ${filename}.png`);
    } catch (err) {
      console.error(`❌ Failed to capture screenshot for ${url}:`, err);
    }
  };

  // 1. Capture public pages
  console.log("\n--- Capturing Public Pages ---");
  for (const route of publicRoutes) {
    await capture(route.path, route.name);
  }

  // 2. Capture student pages
  console.log("\n--- Capturing Student Pages ---");
  for (const route of studentRoutes) {
    await capture(route.path, route.name, STUDENT_TOKEN);
  }

  // 3. Capture admin pages
  console.log("\n--- Capturing Admin Pages ---");
  for (const route of adminRoutes) {
    await capture(route.path, route.name, ADMIN_TOKEN);
  }

  await browser.close();
  console.log(`\n🎉 Screenshots captured successfully! Saved to ${screenshotDir}`);
}

(async () => {
  let child: ChildProcess | null = null;
  try {
    await seedDatabase();
    child = await waitForServer();
    await captureScreenshots();
  } catch (error) {
    console.error("Execution failed:", error);
  } finally {
    if (child) {
      console.log("Shutting down the Next.js server spawned by script...");
      child.kill("SIGTERM");
    }
    process.exit(0);
  }
})();
