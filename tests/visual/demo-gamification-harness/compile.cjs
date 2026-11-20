// Compile only the fictional demo presentation fixture. No browser or service starts.
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
process.env.ZYX_FIXTURE_ISOLATED = '1';
process.env.ZYX_FIXTURE_SOCIAL_GUARD = path.join(__dirname, 'shims.social-guard.ts');
process.env.ZYX_FIXTURE_REWARD_GUARD = path.join(__dirname, 'shims.social-guard.ts');
process.env.ZYX_FIXTURE_ENTRY = path.join(__dirname, 'entry.tsx');
process.env.ZYX_FIXTURE_OUT ||= path.join(root, 'artifacts/visual-quality/demo-gamification-fixture');
process.env.ZYX_FIXTURE_SOURCES = JSON.stringify([
  'components/demo', 'components/gamification', 'components/dashboard/student-groups-compact-client.tsx', 'components/student-profile-view.tsx',
  'components/student-leaderboard-controls.tsx', 'components/student-leaderboard-view.tsx',
  'components/student-academic-leaderboard-view.tsx', 'components/course/course-surfaces.ts',
  'components/ui', 'components/admin', 'components/page-header.tsx', 'components/application-page.tsx',
  'app/(student)/profile/profile-avatar.tsx', 'tests/visual/demo-gamification-harness/entry.tsx',
]);
require('../gamification-harness/compile.cjs');
