import { afterEach, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { studentTodayQuery, type TodayData } from "../../lib/student/today-query";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("shares concurrent requests for one account and isolates other accounts", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ streak: { current: calls, longest: calls }, items: [] }));
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const [sidebar, plan] = await Promise.all([
    client.fetchQuery(studentTodayQuery("student-a")),
    client.fetchQuery(studentTodayQuery("student-a")),
  ]);
  expect(calls).toBe(1);
  expect(sidebar).toEqual(plan);
  expect((await client.fetchQuery(studentTodayQuery("student-b"))).streak.current).toBe(2);
  await client.invalidateQueries({ queryKey: studentTodayQuery("student-a").queryKey, exact: true });
  await client.fetchQuery(studentTodayQuery("student-a"));
  expect(calls).toBe(3);
  expect(client.getQueryData<TodayData>(studentTodayQuery("student-b").queryKey)).toEqual({ streak: { current: 2, longest: 2 }, items: [] });
  client.clear();
});
