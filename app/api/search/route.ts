import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { enrollments } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { getPeranCodes } from "@/lib/auth/authorization";
import { embedSearchQuery, querySearchVectors } from "@/lib/search/service";
import type {
  RoleLevel,
  SiteSearchGroupedResults,
  SiteSearchMatch,
  SiteSearchResponse,
} from "@/lib/search/contracts";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    const trimmedQuery = q.trim();

    if (!trimmedQuery) {
      const emptyResponse: SiteSearchResponse = {
        query: "",
        total: 0,
        grouped: {
          "Course & Modul": [],
          "Materi & Artikel": [],
          "Kuis & Evaluasi": [],
          "Navigasi": [],
        },
      };
      return NextResponse.json(emptyResponse);
    }

    // 1. Authenticate session using Better Auth
    const reqHeaders = await headers();
    const session = await auth.api.getSession({ headers: reqHeaders });
    const user = session?.user;

    // 2. Determine userRoleLevel:
    //    - 0: public (no user)
    //    - 1: student / murid
    //    - 2: teacher / tutor
    //    - 3: admin
    let userRoleLevel: RoleLevel = 0;
    if (user) {
      if (user.role === "admin") {
        userRoleLevel = 3;
      } else if (user.role === "teacher") {
        userRoleLevel = 2;
      } else if (user.role === "student") {
        userRoleLevel = 1;
      }

      // Check database peran membership for fine-grained role resolution
      try {
        const peranCodes = await getPeranCodes(user.id);
        if (peranCodes.includes("admin")) {
          userRoleLevel = 3;
        } else if (peranCodes.includes("tutor") && userRoleLevel < 2) {
          userRoleLevel = 2;
        } else if (peranCodes.includes("murid") && userRoleLevel < 1) {
          userRoleLevel = 1;
        }
      } catch {
        // Fall back to user.role if peran query fails
      }
    }

    // 3. If student (role 1): fetch user's active enrolledCourseIds
    let enrolledCourseIds: string[] = [];
    if (user && userRoleLevel === 1) {
      const now = new Date();
      const activeEnrollments = await db
        .select({ courseId: enrollments.courseId })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.userId, user.id),
            gt(enrollments.expiresAt, now)
          )
        );
      enrolledCourseIds = activeEnrollments.map((r) => r.courseId);
    }

    // 4. Embed query using Gemini embedding adapter (768 dimensions, purpose: "query")
    const queryVector = await embedSearchQuery(trimmedQuery);

    // 5. Query Vectorize with filter { min_role: { "$lte": userRoleLevel } }
    const limitParam = request.nextUrl.searchParams.get("limit");
    const topK = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 50) : 30;

    const searchResults = await querySearchVectors({
      vector: queryVector,
      topK,
      min_role: userRoleLevel,
      filter: {
        min_role: { $lte: userRoleLevel },
      },
    });

    // 6. Post-filter: If student and item has course_id and item min_role >= 1, verify enrolledCourseIds.includes(item.course_id)
    const filteredMatches: SiteSearchMatch[] = [];
    for (const item of searchResults.matches) {
      const itemRole = typeof item.metadata?.min_role === "number" ? item.metadata.min_role : 0;
      const courseId = (item.metadata?.course_id || item.metadata?.courseId) as string | undefined;

      if (userRoleLevel === 1 && courseId && itemRole >= 1) {
        if (!enrolledCourseIds.includes(courseId)) {
          continue;
        }
      }
      filteredMatches.push(item);
    }

    // 7. Group JSON output by category: Course & Modul, Materi & Artikel, Kuis & Evaluasi, Navigasi
    const grouped: SiteSearchGroupedResults = {
      "Course & Modul": [],
      "Materi & Artikel": [],
      "Kuis & Evaluasi": [],
      "Navigasi": [],
    };

    for (const match of filteredMatches) {
      const rawCategory = match.metadata?.category || "";
      const entityType = match.metadata?.entity_type || "";

      let targetGroup: keyof SiteSearchGroupedResults = "Navigasi";
      if (
        rawCategory === "Course & Modul" ||
        rawCategory === "Course" ||
        rawCategory === "Modul" ||
        entityType === "course"
      ) {
        targetGroup = "Course & Modul";
      } else if (
        rawCategory === "Materi & Artikel" ||
        rawCategory === "Materi" ||
        rawCategory === "Artikel" ||
        rawCategory === "Diktat" ||
        entityType === "chapter" ||
        entityType === "material" ||
        entityType === "blog"
      ) {
        targetGroup = "Materi & Artikel";
      } else if (
        rawCategory === "Kuis & Evaluasi" ||
        rawCategory === "Kuis" ||
        rawCategory === "Evaluasi" ||
        rawCategory === "Tryout" ||
        rawCategory === "Exam" ||
        entityType === "quiz" ||
        entityType === "exam"
      ) {
        targetGroup = "Kuis & Evaluasi";
      }

      grouped[targetGroup].push(match);
    }

    const response: SiteSearchResponse = {
      query: trimmedQuery,
      total: filteredMatches.length,
      grouped,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    console.error("[api/search] Error processing search request:", error);
    return NextResponse.json(
      { error: message, total: 0, grouped: { "Course & Modul": [], "Materi & Artikel": [], "Kuis & Evaluasi": [], "Navigasi": [] } },
      { status: 500 }
    );
  }
}
