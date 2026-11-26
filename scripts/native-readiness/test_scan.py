import tempfile
import unittest
from pathlib import Path

from scan import scan


class SourceInventoryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def put(self, path, content):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding='utf-8')

    def test_candidates_and_unresolved_edges(self):
        self.put('app/(student)/layout.tsx', 'export default function Layout() {}')
        self.put('app/(student)/courses/[id]/page.tsx', '''import { load } from "@/lib/actions";
import { helper } from "./helper";
import missing from "./missing";
export default async function Page() {
  await load(); helper();
  await fetch(`/api/courses/${id}`, { method: "POST" });
  await fetch(endpoint);
  return import(dynamicPath);
}''')
        self.put('app/(student)/courses/[id]/helper.ts', 'import { other } from "@/lib/deeper";\nexport function helper() { other() }')
        self.put('lib/deeper.ts', 'export function other() {}')
        self.put('lib/actions.ts', '"use server";\nexport async function load() {}')
        self.put('app/api/courses/[courseId]/route.ts', 'export async function POST() {}')
        result = scan(self.root, ['app/(student)/courses/[id]/page.tsx'], 1)['pages'][0]
        self.assertEqual(result['route'], '/courses/[id]')
        self.assertIn('app/(student)/layout.tsx', result['entrypoints'])
        action = next(x for x in result['references'] if x['kind'] == 'server_action_import')
        self.assertEqual((action['symbol'], action['status']), ('load', 'unverified'))
        url = next(x for x in result['references'] if x['kind'] == 'api_url_literal')
        self.assertEqual(url['candidate_handlers'][0]['route'], '/api/courses/[courseId]')
        self.assertEqual(url['candidate_handlers'][0]['methods'], ['POST'])
        reasons = {x['reason'] for x in result['unresolved']}
        self.assertTrue({'missing_local_module', 'depth_limit', 'dynamic_url', 'dynamic_expression', 'non_literal_or_non_api_fetch'} <= reasons)

    def test_direct_database_and_inline_action_are_candidates(self):
        self.put('app/admin/page.tsx', '''import { db } from "@/db";
export default function Page() {
  async function save() { "use server"; }
  return db.select();
}''')
        self.put('db/index.ts', 'export const db = {};')
        refs = scan(self.root, ['app/admin/page.tsx'], 0)['pages'][0]['references']
        self.assertIn('server_data_access_candidate', {x['kind'] for x in refs})
        self.assertIn('inline_server_action_candidate', {x['kind'] for x in refs})
        self.assertTrue(all(x['status'] == 'unverified' for x in refs))


if __name__ == '__main__':
    unittest.main()
