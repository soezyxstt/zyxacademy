import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

test("a slower previous filter request cannot replace the latest tutor activity", async () => {
  const require = createRequire(import.meta.url);
  const { transformSync } = require(process.env.UI_TEST_ESBUILD ?? "esbuild");
  const pending: Promise<unknown>[] = [];
  const requests: Array<(value: unknown) => void> = [];
  const committed: unknown[] = [];
  let stateIndex = 0;
  const jsx = (type: unknown, props: any) => ({ type, props });
  const dependencies: Record<string, unknown> = {
    "react": {
      useState: (initial: unknown) => {
        const index = stateIndex++;
        return [initial, (value: unknown) => { if (index === 1) committed.push(value); }];
      },
      useEffect: () => {}, useRef: () => ({ current: 0 }),
      useTransition: () => [false, (run: () => Promise<unknown>) => pending.push(run())],
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "lucide-react": {}, "@/components/ui/button": {},
    "@/lib/i18n/client": { useTranslations: () => (key: string) => key },
    "./activity-filters": { ActivityFilters: "filters" },
    "./activity-table": { ActivityTable: "table" },
    "../actions": { getTutorActivityLogsAction: () => new Promise(resolve => requests.push(resolve)) },
  };
  const source = readFileSync("app/(admin)/admin/ops/tutor-activity/_components/tutor-activity-client.tsx", "utf8");
  const code = transformSync(source, { loader: "tsx", jsx: "automatic", format: "cjs" }).code;
  const module = { exports: {} as any };
  runInNewContext(code, { module, exports: module.exports, console, require: (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
    return dependencies[name];
  } });
  const tree = module.exports.TutorActivityClient({ initialResult: { items: [], limit: 25, hasNextPage: false, nextCursor: null }, options: {} });
  const filter = tree.props.children.find((child: any) => child?.type === "filters");
  filter.props.onFilterChange({ courseId: "old" });
  filter.props.onFilterChange({ courseId: "new" });
  requests[1]({ items: ["latest"], nextCursor: null, hasNextPage: false });
  await pending[1];
  requests[0]({ items: ["obsolete"], nextCursor: null, hasNextPage: false });
  await pending[0];
  expect(committed).toEqual([["latest"]]);
});
