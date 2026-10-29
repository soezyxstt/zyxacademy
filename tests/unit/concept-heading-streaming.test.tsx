import { describe, expect, it, mock } from "bun:test";

const enrollment = mock(async () => true);
const getData = mock(async () => ({ conceptName: "Hukum Ohm: V = IR", kosByType: {}, prerequisites: [], unlocks: [], related: [] }));
mock.module("@/app/(student)/dashboard/actions", () => ({ checkEnrollment: enrollment }));
mock.module("@/lib/concept-explorer-service", () => ({ getConceptExplorerData: getData }));
mock.module("@/lib/course-utils", () => ({ getCourse: async () => ({ title: "Fisika" }) }));
mock.module("@/lib/auth-session", () => ({ getAuthSession: async () => ({ user: { id: "student" } }) }));
mock.module("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, usePathname: () => "/", useRouter: () => ({}), useSearchParams: () => new URLSearchParams() }));
mock.module("@/components/course/course-skeletons", () => ({ CourseConceptExplorerSkeleton: () => null }));
mock.module("@/components/enrollment-form", () => ({ EnrollmentForm: () => null }));
mock.module("@/components/course/markdown-renderer", () => ({ MarkdownRenderer: () => null }));
mock.module("@/components/course/math-text", () => ({ MathText: () => null }));
mock.module("@/lib/site", () => ({ createMetadata: () => ({}) }));
mock.module("@/lib/i18n/server", () => ({ getTranslations: async () => () => "" }));

const { default: Page } = await import("@/app/(student)/courses/[id]/concept/[slug]/page");

describe("concept heading", () => {
  it("streams the localized name and shares one lookup with the content", async () => {
    enrollment.mockResolvedValue(true);
    getData.mockClear();
    const page = await Page({ params: Promise.resolve({ id: "physics", slug: "hukum-ohm" }) });
    const title = page.props.title.props.children;
    const content = page.props.children.props.children;
    expect(title.props.dataPromise).toBe(content.props.dataPromise);
    expect(await title.type(title.props)).toBe("Hukum Ohm: V = IR");
    expect(getData).toHaveBeenCalledTimes(1);
    expect(getData).toHaveBeenCalledWith("physics", "hukum-ohm", "student");
  });

  it("does not load concept data for a student without enrollment", async () => {
    enrollment.mockResolvedValue(false);
    getData.mockClear();
    const page = await Page({ params: Promise.resolve({ id: "physics", slug: "hukum-ohm" }) });
    const title = page.props.title.props.children;
    const result = await title.type(title.props);
    expect(result.props.messageKey).toBe("conceptPage.title");
    expect(getData).not.toHaveBeenCalled();
  });
});
