export function createReportDraft(role: "admin" | "tutor", courseId?: string | null) {
  return {
    proposalType: role === "admin" ? "course_readiness" : "misconception_brief",
    courseId: courseId ?? null,
    scope: courseId ? { courseId } : {},
    evidenceRefs: [courseId ? `course:${courseId}` : "ops:current"],
    preconditionSnapshot: { version: 1 },
    operations: [{ kind: "read_only_report", reportKey: role === "admin" ? "course_readiness" : "misconception_brief" }],
    learnerImpact: { audience: courseId ? "single_course" : "none", summary: "Tidak ada perubahan yang diterapkan." },
    reversibility: { reversible: true, rollback: "Tidak ada mutasi; proposal dapat ditolak atau kedaluwarsa." },
    warnings: ["Hasil ini adalah proposal dan memerlukan review manusia."],
    rationale: role === "admin" ? "Tinjau kesiapan course secara terstruktur." : "Tinjau pola miskonsepsi secara terstruktur.",
  };
}
