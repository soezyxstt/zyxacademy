import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { searchDocuments } from "@/db/schema";
import { eq, and, lte, or, ilike, inArray } from "drizzle-orm";
import { getPeranCodes } from "@/lib/auth/authorization";
import { embedSearchQuery, querySearchVectors } from "@/lib/search/service";
import { parseSearchQueryString } from "@/lib/search/parser";
import type {
  RoleLevel,
  SiteSearchGroupedResults,
  SiteSearchMatch,
  SiteSearchResponse,
} from "@/lib/search/contracts";
import { isMarketingHref } from "@/lib/site-search-index";
import { resolveStudentSearchCandidates, type StudentSearchCandidate } from "@/lib/search/student-course-results";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    const trimmedQuery = q.trim();

    const emptyGrouped: SiteSearchGroupedResults = {
      "Course & Modul": [],
      "Materi & Artikel": [],
      "Kuis & Evaluasi": [],
      "Navigasi": [],
      "Administrasi": [],
    };

    if (!trimmedQuery) {
      const emptyResponse: SiteSearchResponse = {
        query: "",
        total: 0,
        grouped: emptyGrouped,
      };
      return NextResponse.json(emptyResponse);
    }

    // 1. Parse structured query (check for prefixes e.g. group:, meet:, user:, form:, token:, schedule:)
    const parsed = parseSearchQueryString(trimmedQuery);

    // 2. Authenticate session using Better Auth
    const reqHeaders = await headers();
    const session = await auth.api.getSession({ headers: reqHeaders });
    const user = session?.user;

    // 3. Determine userRoleLevel:
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

    // 4. Enforce strict RBAC for restricted prefix scopes
    if (parsed.isScoped) {
      if ((parsed.entityType === "user" || parsed.entityType === "token") && userRoleLevel < 3) {
        return NextResponse.json({
          query: trimmedQuery,
          total: 0,
          grouped: emptyGrouped,
        });
      }
    }

    const limitParam = request.nextUrl.searchParams.get("limit");
    const topK = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 50) : 30;

    let matches: SiteSearchMatch[] = [];

    // 6. Execution Branch: Scoped Search vs Global Search
    const effectiveQuery = parsed.isScoped ? (parsed.cleanQuery || parsed.prefixLabel || "") : trimmedQuery;

    if (effectiveQuery) {
      try {
        const queryVector = await embedSearchQuery(effectiveQuery);
        const vectorizeFilter: Record<string, unknown> = {
          min_role: { $lte: userRoleLevel },
        };
        if (parsed.isScoped && parsed.entityType) {
          vectorizeFilter.entity_type = parsed.entityType;
        }

        const searchResults = await querySearchVectors({
          vector: queryVector,
          topK,
          min_role: userRoleLevel,
          filter: vectorizeFilter,
        });
        matches = searchResults.matches;
      } catch (err) {
        console.warn("[api/search] Vectorize search fallback to database query:", err);
      }
    }

    // 7. Fallback / Hybrid Database Search for exact keyword matches
    // Especially helpful for exact IDs, email addresses, names, tokens, or group titles
    if (matches.length < topK) {
      try {
        const dbConditions = [
          lte(searchDocuments.minRole, userRoleLevel),
        ];

        if (parsed.isScoped && parsed.entityType) {
          dbConditions.push(eq(searchDocuments.entityType, parsed.entityType as any));
        }

        const searchTerm = `%${effectiveQuery}%`;
        if (effectiveQuery) {
          dbConditions.push(
            or(
              ilike(searchDocuments.title, searchTerm),
              ilike(searchDocuments.searchableText, searchTerm),
              ilike(searchDocuments.path, searchTerm)
            )!
          );
        }

        const directDbDocs = await db
          .select()
          .from(searchDocuments)
          .where(and(...dbConditions))
          .limit(topK);

        const existingIds = new Set(matches.map((m) => m.id));
        for (const doc of directDbDocs) {
          if (!existingIds.has(doc.id)) {
            existingIds.add(doc.id);
            matches.push({
              id: doc.id,
              score: 0.9,
              metadata: {
                title: doc.title,
                subtitle: doc.entityType,
                href: doc.path,
                category: doc.entityType,
                entity_type: doc.entityType,
                entity_id: doc.entityId || "",
                course_id: doc.courseId || undefined,
                min_role: doc.minRole as RoleLevel,
              },
            });
          }
        }
      } catch (dbErr) {
        console.error("[api/search] Direct database search fallback error:", dbErr);
      }
    }

    const candidates = new Map<SiteSearchMatch, StudentSearchCandidate>();
    if (user && userRoleLevel === 1) {
      const indexed = matches.length ? await db.select().from(searchDocuments).where(inArray(searchDocuments.id, matches.map((item) => item.id))) : [];
      const byId = new Map(indexed.map((doc) => [doc.id, doc]));
      for (const item of matches) {
        const doc = byId.get(item.id);
        if (!doc || doc.minRole > userRoleLevel) {
          candidates.set(item, { courseId: "", entityId: "", type: "" });
          continue;
        }
        const type = String(doc?.entityType ?? item.metadata?.entity_type ?? "").toLowerCase();
        const href = String(item.metadata?.href ?? item.metadata?.path ?? "");
        const courseId = doc?.courseId;
        const entityId = doc?.entityId;
        if (["course", "chapter", "material", "quiz", "exam"].includes(type) || courseId || /^\/courses\/[^/]+/.test(href) || /^(course|chapter|material|quiz|exam)_/.test(item.id)) {
          if (typeof courseId === "string" && typeof entityId === "string") candidates.set(item, { courseId, entityId, type });
          else candidates.set(item, { courseId: "", entityId: "", type });
        }
      }
    }
    const current = user && userRoleLevel === 1 ? await resolveStudentSearchCandidates(user.id, [...candidates.values()]) : new Map<StudentSearchCandidate, string>();

    const filteredMatches: SiteSearchMatch[] = [];
    for (const item of matches) {
      const itemRole = typeof item.metadata?.min_role === "number" ? item.metadata.min_role : 0;
      const href = (item.metadata?.href || item.metadata?.path || "") as string;

      if (userRoleLevel === 0) {
        if (!isMarketingHref(href)) {
          continue;
        }
      }

      if (itemRole > userRoleLevel) continue;
      const candidate = candidates.get(item);
      if (candidate) {
        const title = current.get(candidate);
        if (!title) continue;
        const suffix = candidate.type === "material" ? `/material/${encodeURIComponent(candidate.entityId)}` : candidate.type === "quiz" ? `/quiz/${encodeURIComponent(candidate.entityId)}` : "";
        filteredMatches.push({ id: item.id, score: item.score, metadata: { title, href: `/courses/${encodeURIComponent(candidate.courseId)}${suffix}`, category: candidate.type, entity_type: candidate.type, entity_id: candidate.entityId, course_id: candidate.courseId, min_role: 1 } });
        continue;
      }
      filteredMatches.push(item);
    }

    // 9. Group output by 5 ordered categories:
    //    1. Course & Modul (Top priority)
    //    2. Materi & Artikel
    //    3. Kuis & Evaluasi
    //    4. Navigasi
    //    5. Administrasi (Lowest priority - groups, meet, forms, tokens, schedules, users)
    const grouped: SiteSearchGroupedResults = {
      "Course & Modul": [],
      "Materi & Artikel": [],
      "Kuis & Evaluasi": [],
      "Navigasi": [],
      "Administrasi": [],
    };

    for (const match of filteredMatches) {
      const rawCategory = (match.metadata?.category || "").toString().toLowerCase();
      const entityType = (match.metadata?.entity_type || "").toString().toLowerCase();

      let targetGroup: keyof SiteSearchGroupedResults = "Navigasi";
      if (
        rawCategory.includes("course") ||
        rawCategory.includes("modul") ||
        entityType === "course"
      ) {
        targetGroup = "Course & Modul";
      } else if (
        rawCategory.includes("materi") ||
        rawCategory.includes("artikel") ||
        rawCategory.includes("blog") ||
        rawCategory.includes("diktat") ||
        entityType === "chapter" ||
        entityType === "material" ||
        entityType === "blog"
      ) {
        targetGroup = "Materi & Artikel";
      } else if (
        rawCategory.includes("kuis") ||
        rawCategory.includes("evaluasi") ||
        rawCategory.includes("tryout") ||
        rawCategory.includes("quiz") ||
        rawCategory.includes("exam") ||
        entityType === "quiz" ||
        entityType === "exam"
      ) {
        targetGroup = "Kuis & Evaluasi";
      } else if (
        rawCategory.includes("group") ||
        rawCategory.includes("grup") ||
        rawCategory.includes("meet") ||
        rawCategory.includes("user") ||
        rawCategory.includes("form") ||
        rawCategory.includes("token") ||
        rawCategory.includes("schedule") ||
        entityType === "group" ||
        entityType === "meet" ||
        entityType === "user" ||
        entityType === "form" ||
        entityType === "token" ||
        entityType === "schedule"
      ) {
        targetGroup = "Administrasi";
      } else {
        targetGroup = "Navigasi";
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
      {
        error: message,
        total: 0,
        grouped: {
          "Course & Modul": [],
          "Materi & Artikel": [],
          "Kuis & Evaluasi": [],
          "Navigasi": [],
          "Administrasi": [],
        },
      },
      { status: 500 }
    );
  }
}
