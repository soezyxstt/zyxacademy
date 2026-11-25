import { assertTarget } from '../neon/import-core';

export type Mode = 'check' | 'rehearse' | 'apply';
export const PRODUCTION_HOST = 'ep-quiet-math-azyey0mb.c-3.ap-southeast-1.aws.neon.tech';
export const PRODUCTION_BRANCH = 'br-wandering-butterfly-azi11h8r';
export const DATABASE = 'neondb';
const productionHosts = [PRODUCTION_HOST, PRODUCTION_HOST.replace('.c-3.', '-pooler.c-3.')];

// Git blob bytes, not Windows checkout CRLF bytes or historical ledger hashes.
export const FILES: ReadonlyArray<readonly [number, string, string]> = [
 [1793511246302, '0000_neon-initial', '5fbe4a906e5859c37e54c450ad7ad8b41c3da1831e675c56d8b624a99975ca11'],
 [1793543028278, '0001_source-import-order', '73e4fe389c5e0cf3151c15d3ed64c84343306b85e7392cd9ada18516a029e5c6'],
 [1793581695085, '0002_classy_onslaught', '7a9da240d42361c5df25a2c02b05787ae7915d9c0a240566931b719a244214e0'],
 [1793788961145, '0003_kind_shinko_yamashiro', '6e4fbfec652ac32b31a924181264663557c87587bf908eeeb91cec7aba84a7c3'],
 [1793879100162, '0004_loud_electro', '76fac8491411a5d6d185ceeaea21f76349db8b974d9b47d5e4acd08612d29b68'],
 [1793899854102, '0005_violet_maelstrom', 'd7a9ac6e2891c7ef71d9060149ec70f4bcd1af66c1fc433d64e7ebd47be12987'],
 [1793908326585, '0006_large_rocket_racer', '5ede759fcb2a7916cb2df98eff1974852ae5ddfcc3c6b9f1fb6775ae9cf3c451'],
 [1794545146148, '0007_medical_quentin_quire', '2c922674009b7ed809efac9b6fa7dfaf6288543a860c28b847a2f544515bbd5b'],
 [1794585056992, '0008_moaning_mole_man', '88e249b4ad08b38abce42f9f1efa1d3178b67bc85cd3727356ceb0d8fc91aff3'],
 [1794643137397, '0009_glossy_black_tarantula', '91fb45fe667fb0d31b014778767084ff2cf045b42a6d1c5385dd44743e68a985'],
 [1794643491167, '0010_confused_overlord', 'a753b57c1fafb0576faec89c392d39c61945a6af847aaccae17061bca3c96977'],
 [1794644106608, '0011_cooing_dormammu', '4389ef20b1bb108d656ea58ff6c12b6b74839f6522c7e3ba81f94d426f35a969'],
 [1794644373767, '0012_late_wolverine', '7ec2941da2101b4168c25a5d95334e8cfd590a6b281ea6d8bc25e424d1e74d64'],
 [1794644822596, '0013_lazy_microchip', '6bf7441d83eaa2ef7f6336a3cda0d7f80a39c5f6ee487d88935cc9adf9dc3824'],
 [1794644976050, '0014_bent_shotgun', 'a7122c404a62687a2e8d5fddd3e1b7db72e282d1c59606c6eb8d8460d61ad085'],
 [1794646224492, '0015_sticky_mandarin', 'edfc0bf8cb3b1bed696f233b75c7508765fc18081d1cc76e6fac3a50e5dfd4ee'],
 [1794663999331, '0016_smiling_grandmaster', 'ab8260d9c42e60f5e188839f37580e8591473e657272bc4f4e6e478c98042e49'],
 [1794682179689, '0017_quiet_the_hand', 'db368d90db8a2538ce288cb92221cf2f1583db0c6de44b63af7f6089549ac465'],
 [1794684199718, '0018_equal_nicolaos', 'a0338adbfdfd666827fedac1ea0539d45df186aa06972fb4ab8185c7df05be41'],
 [1794684510330, '0019_sparkling_ultragirl', '9afb969b564147a2476080a0e5c32cfd194a6e280349d618cdd3388ada1ea6cf'],
 [1794684833202, '0020_sparkling_lady_vermin', '1bae0d6e04e94879e57be391a3953ba83197dcc79ffa3a40cecb7eb0a7cdb2bf'],
 [1794687691693, '0021_superb_magus', 'c61d983b56428c854e054cb165dec2b6418e048c99d4ab539f966d912441bdc6'],
 [1794688351346, '0022_rich_lady_vermin', '89706d6db177b458a52849f1303e68915c89909cfc70d443b91e7836a5e70a1a'],
 [1794689158352, '0023_supreme_speedball', '919108f68d9533718fae4742ad865ee470ceb5ced46f8cd24157436d7883cee9'],
 [1794779543997, '0024_strong_newton_destine', '4daa59e714c25b571a2f5e723324194a6ba1534870782fb4e0ce02aee6ae9d34'],
 [1794780730200, '0025_bizarre_groot', '90590e585eff3c6819f8cfe39bee6c5ee62ef45db9c0b1341b4cf4324db01998'],
 [1794782055615, '0026_productive_gressill', 'fd93740e20a45f6b672fb61b1d8487f1b31c7f58af4ddbce3c20d88fcf85547e'],
 [1794783786784, '0027_square_spyke', 'ef1fecba4ac9025e751096516a3c7d87e166faf9196269978f2992b560ca9eda'],
 [1794788099039, '0028_confused_natasha_romanoff', 'd4e965ff711226581ca6b61b75a534de183fa072748f03eb93a8029d7ca67241'],
 [1794798612483, '0029_harsh_meggan', 'c07cee04c8d80bdf7cbdc3f0491bdf1d91a19e6ec5c88d02df8470ebae2e4dc9'],
 [1794802396688, '0030_mighty_ogun', 'ccefe455f94546ce8fc33d7cc137890d01cc115a3604d03ae25902cb5fc80b0b'],
 [1794806584386, '0031_certain_chimera', 'ed76b5f9ae29300d85b9ed1ca941f741bbbc0572be043a163cee26d75a53461c'],
 [1794810408552, '0032_quiet_taskmaster', 'd206eca760fe660495d09c35c0b7e7a9ec891affa7ffed9413f28484afbae373'],
 [1794816019981, '0033_fluffy_devos', '1f4860765acf3d9356c4830513c7b3a892efe111526679064437c1bbafa1be6c'],
 [1794823859346, '0034_aromatic_silhouette', '2b9ea082707c26feec117d895ac622614746d16377fe46a8c805ef5f5809f677'],
 [1795109679359, '0035_queue_task_checkpoints', '7436deb3c2fba323939de959c4021fa6acd52f226d6d94363113bffab1f18b04'],
 [1795116616448, '0036_student_pet_studio', '8bbff58789fab43c4ab6b17d217bac2d87690a1e9b07101e79c0bc2e06216b5a'],
 [1795157189870, '0037_member_profile_visibility', '5d39e45cce56a0baa6c7f824099caa0875c621a0639319ac3977e29251c4d0eb'],
 [1795160115877, '0038_discussion_mention_handles', '969b249e8a666b72ce6cff55a6f3d06fecc08959664645eb9cd1c529b609d097'],
 [1795200000000, '0039_push_token_transport', 'cde8febb5a0144bdcb580261ee9d1a7f0a27d742e2621fb6291abb4933914d44'],
 [1795276800000, '0040_google_calendar_sync', '41ab1dfef0a5877bb03b4b4dd506e86ecb7b4ae8c02d6312803e9fd5e2c6017c'],
 [1795425908526, '0041_discussion_search_indexes', '8ff947d226653c5c2c98eeb07e9efddb68a66561b2cbbdf7523d259745b6b1ae'],
 [1795460000000, '0042_tutor_slot_courses', '8ef6b7cc7312bec77fef6961ae25ab69024cb19114eccd4de160091c920c4fd5'],
];

export const BASELINE: ReadonlyArray<readonly [number, string]> = [
 [1793511246302, 'd409bf87b7c12a71359ba75050890a1025d2a1c03cae3e9d23a8f374018f57ef'],
 [1793543028278, '73e4fe389c5e0cf3151c15d3ed64c84343306b85e7392cd9ada18516a029e5c6'],
 [1793581695085, 'bb8a23129fc974d828b615b463a6ad78e7316b4523fa4ef127e99b27440aad49'],
 [1793788961145, 'b3fb00e1bae1ba8c2ab0257df60bd68651917283f4dc6cc05ff3257ff497c263'],
 [1793879100162, '76fac8491411a5d6d185ceeaea21f76349db8b974d9b47d5e4acd08612d29b68'],
 [1793899854102, 'd7a9ac6e2891c7ef71d9060149ec70f4bcd1af66c1fc433d64e7ebd47be12987'],
 [1793908326585, '5ede759fcb2a7916cb2df98eff1974852ae5ddfcc3c6b9f1fb6775ae9cf3c451'],
 [1794545146148, '2c922674009b7ed809efac9b6fa7dfaf6288543a860c28b847a2f544515bbd5b'],
 [1794585056992, '88e249b4ad08b38abce42f9f1efa1d3178b67bc85cd3727356ceb0d8fc91aff3'],
];

export function classifyJournal(rows: ReadonlyArray<{ created_at: unknown; hash: unknown }>) {
 const expected = rows.length === 9 ? BASELINE : rows.length === FILES.length ? [...BASELINE, ...FILES.slice(9).map(([time, , hash]) => [time, hash] as const)] : null;
 if (!expected || rows.some((row, i) => String(row.created_at) !== String(expected[i][0]) || row.hash !== expected[i][1])) throw new Error('UNEXPECTED_MIGRATION_HISTORY');
 return rows.length === 9 ? 'pending' : 'complete';
}

export function assertFiles(entries: ReadonlyArray<{ idx: number; when: number; tag: string; version: string; breakpoints: boolean }>, hashes: readonly string[], names: readonly string[]) {
 if (entries.length !== FILES.length || hashes.length !== FILES.length || names.length !== FILES.length ||
     names.slice().sort().some((name, i) => name !== `${FILES[i][1]}.sql`) ||
     entries.some((entry, i) => entry.idx !== i || entry.when !== FILES[i][0] || entry.tag !== FILES[i][1] || entry.version !== '7' || entry.breakpoints !== true || hashes[i] !== FILES[i][2])) throw new Error('UNEXPECTED_LOCAL_MIGRATION_CHAIN');
}

export function parseArguments(args: string[]): { mode: Mode; metadataPath: string } {
 if (args.length !== 3 || !['--check', '--rehearse', '--apply'].includes(args[0]) || args[1] !== '--source-metadata' || !args[2] || args[2].startsWith('--')) throw new Error('USAGE_MODE_AND_SOURCE_METADATA_REQUIRED');
 return { mode: args[0].slice(2) as Mode, metadataPath: args[2] };
}

// Metadata must come from an independent Neon endpoint/branch inventory, never DATABASE_URL.
export function assertEnvironment(mode: Mode, env: Record<string, string | undefined>, metadata: unknown) {
 const host = env.NEON_EXPECTED_HOST || '';
 const branch = env.NEON_BRANCH_ID || '';
 try { assertTarget(env.DATABASE_URL || '', host, DATABASE); } catch { throw new Error('TARGET_IDENTITY_MISMATCH'); }
 if (env.NEON_EXPECTED_DATABASE !== DATABASE || !metadata || typeof metadata !== 'object') throw new Error('SOURCE_METADATA_REQUIRED');
 const m = metadata as Record<string, unknown>;
 if (!productionHosts.includes(String(m.sourceHost)) || m.sourceBranchId !== PRODUCTION_BRANCH || m.sourceDatabase !== DATABASE ||
     m.targetHost !== host || m.targetBranchId !== branch || m.targetDatabase !== DATABASE) throw new Error('SOURCE_METADATA_MISMATCH');
 if (mode === 'rehearse') {
  if (m.disposable !== true || m.parentBranchId !== PRODUCTION_BRANCH || !/^br-[a-z0-9-]+$/.test(branch) ||
      [PRODUCTION_BRANCH, 'br-gentle-scene-azq0gp91'].includes(branch) ||
      !/^ep-[a-z0-9-]+(?:-pooler)?\.c-3\.ap-southeast-1\.aws\.neon\.tech$/.test(host) ||
      productionHosts.includes(host) || host.replace('-pooler.', '.') === 'ep-sparkling-lab-azrp3ymj.c-3.ap-southeast-1.aws.neon.tech' ||
      env.PRODUCTION_MIGRATION_DISPOSABLE !== '1') throw new Error('DISPOSABLE_CLONE_REQUIRED');
 } else if (!productionHosts.includes(host) || branch !== PRODUCTION_BRANCH || m.disposable !== false) throw new Error('PRODUCTION_TARGET_REQUIRED');
 if (mode === 'apply' && env.PRODUCTION_MIGRATION_WRITERS_FENCED !== '1') throw new Error('WRITERS_FENCED_REQUIRED');
 return { host, branch, database: DATABASE };
}

export type Cosmetic = { id: string; name: string; slot: string; priceLp: number; active: boolean };
export type CosmeticRow = { id: string; name: string; slot: string; price_lp: string | number; active: boolean };
export function planCatalog(current: readonly CosmeticRow[], catalog: readonly Cosmetic[]) {
 const expected = new Map(catalog.map(item => [item.id, item]));
 const retire: string[] = [];
 for (const row of current) {
  const item = expected.get(row.id);
  if (!item) throw new Error('CATALOG_CONFLICT');
  if (item.name !== row.name || item.slot !== row.slot || item.priceLp !== Number(row.price_lp)) throw new Error('CATALOG_CONFLICT');
  if (item.active !== row.active) {
   if (item.slot !== 'zyra_avatar' || item.active || !row.active) throw new Error('CATALOG_CONFLICT');
   retire.push(item.id);
  }
 }
 const existing = new Set(current.map(row => row.id));
 if (existing.size !== current.length) throw new Error('CATALOG_CONFLICT');
 return { insert: catalog.filter(item => !existing.has(item.id)), retire };
}

export function assertDefinitions(rows: ReadonlyArray<{ name: unknown; definition: unknown; valid: unknown }>, expected: Record<string, string>) {
 if (rows.length !== Object.keys(expected).length || new Set(rows.map(row => row.name)).size !== rows.length ||
     rows.some(row => row.valid !== true || expected[String(row.name)] !== row.definition)) throw new Error('UNEXPECTED_SCHEMA_DEFINITION');
}
