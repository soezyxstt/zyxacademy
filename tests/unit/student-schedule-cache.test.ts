import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { scopeStudentSchedule } from "@/lib/schedule/student-schedule-scope";

test("weeks load on demand and a mutation prevents an older request from restoring stale data", async () => {
  const require = createRequire(import.meta.url);
  const { transformSync } = require(process.env.UI_TEST_ESBUILD ?? "esbuild");
  const payload = { user: { id: "student" }, groups: [], enrollments: [], availableSlots: [], groupBookings: [], academicSchedules: [], weekInfo: {} };
  const refs: any[] = [], effects: Array<() => void> = [], requests: Array<{ offset: number; courseId?: string; resolve: (value: any) => void }> = [], committed: any[] = [];
  let stateIndex = 0;
  const jsx = (type: unknown, props: any) => ({ type, props });
  const dependencies: Record<string, any> = {
    react: { useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn(), useEffect: (fn: () => void) => effects.push(fn), useRef: (value: unknown) => { const ref = { current: value }; refs.push(ref); return ref; }, useState: (value: unknown) => { const index = stateIndex++; return [[payload, 0, false][index] ?? value, (next: unknown) => { if (index === 0) committed.push(next); }]; } },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/navigation": { useSearchParams: () => new URLSearchParams() },
    "@/lib/i18n/client": { useTranslations: () => (key: string) => key },
    "@/components/student-experience-provider": { useStudentExperience: () => ({ mode: "full" }) },
    "@/components/demo/use-demo-community": { useDemoCommunity: () => ({ scope: { courseId: "demo", revision: 1 }, state: {} }) },
    "./actions": { getScheduleData: (offset: number, courseId?: string) => new Promise(resolve => requests.push({ offset, courseId, resolve })) },
    "@/lib/schedule/student-schedule-scope": { scopeStudentSchedule },
    "@/components/schedule/schedule-calendar-readability.module.css": { default: {} },
    "@/components/schedule/collaborative-booking-modal": { CollaborativeBookingModal: "booking" },
  };
  const module = { exports: {} as any };
  const source = readFileSync("app/(student)/dashboard/schedule/schedule-client.tsx", "utf8");
  runInNewContext(transformSync(source, { loader: "tsx", jsx: "automatic", format: "cjs" }).code, { module, exports: module.exports, URLSearchParams, console, require: (name: string) => dependencies[name] ?? {} });
  const tree = module.exports.StudentScheduleClient({ selectedCourse: { id: "canonical-a", title: "A", compatibleCourseIds: ["canonical-a", "legacy-a"] } });
  const cache = refs[1].current as Map<number, any>;
  cache.set(4, { stale: true });
  effects.at(-1)!();
  expect(requests.map(row => [row.offset, row.courseId])).toEqual([[0, "canonical-a"]]);
  const booking = tree.props.children.find((child: any) => child?.type === "booking");
  const saved = booking.props.onSuccess({ bookingId: "new", pendingResources: [] });
  expect(cache.size).toBe(0);
  requests[0].resolve({ stale: true });
  await Promise.resolve();
  await Promise.resolve();
  expect(cache.size).toBe(0);
  expect(committed).toEqual([]);
  requests[1].resolve(payload);
  await saved;
  expect(committed).toEqual([payload]);
  expect([...cache.keys()]).toEqual([0]);
  expect(cache.get(0)).toBe(payload);
});
