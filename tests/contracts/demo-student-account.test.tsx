import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StudentExperienceProvider, type StudentExperienceAdapter } from "@/components/student-experience-provider";

mock.module("@/lib/auth-client", () => ({ useSession: () => { throw new Error("LIVE_ACCOUNT_ACCESSED"); } }));
const { StudentAccountBoundary } = await import("@/components/student-account-boundary");

test("fictional student identity never subscribes to the visitor's real session", () => {
  const adapter: StudentExperienceAdapter = {
    mode: "demo", courseHref: () => "/demo/overview", route: () => "/demo", baseline: [],
    selectedCourseId: "fictional-course", overlay: null, ready: true,
    account: { name: "Pelajar Demo", email: "pelajar@example.test" },
  };
  const html = renderToStaticMarkup(<StudentExperienceProvider value={adapter}>
    <StudentAccountBoundary>{({data,isPending}) => <span>{data?.user.name}:{data?.user.email}:{String(isPending)}</span>}</StudentAccountBoundary>
  </StudentExperienceProvider>);
  expect(html).toContain("Pelajar Demo:pelajar@example.test:false");
  expect(() => renderToStaticMarkup(<StudentAccountBoundary>{() => null}</StudentAccountBoundary>)).toThrow("LIVE_ACCOUNT_ACCESSED");
});
