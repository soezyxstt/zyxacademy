// Build only the fictional achievements fixture. No browser or external service is started.
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
process.env.ZYX_FIXTURE_ISOLATED = '1';
process.env.ZYX_FIXTURE_ACHIEVEMENTS = '1';
process.env.ZYX_FIXTURE_ENTRY = path.join(__dirname, 'achievements-entry.tsx');
process.env.ZYX_FIXTURE_OUT ||= path.join(root, 'artifacts/visual-quality/achievements-fixture');
process.env.ZYX_FIXTURE_SOURCES = JSON.stringify([
  'components/gamification', 'components/ui', 'components/admin/state-panels.tsx',
  'components/page-header.tsx', 'components/application-page.tsx',
  'app/(student)/profile/profile-avatar.tsx', 'tests/visual/gamification-harness/achievements-entry.tsx',
]);
require('./compile.cjs');
