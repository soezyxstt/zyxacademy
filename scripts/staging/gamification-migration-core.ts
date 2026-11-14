/** Exact observed staging history. Historical 0000 and 0002 hashes predate the checked-in SQL. */
export const EXPECTED_JOURNAL: ReadonlyArray<readonly [number, string]> = [
 [1793511246302, 'd409bf87b7c12a71359ba75050890a1025d2a1c03cae3e9d23a8f374018f57ef'],
 [1793543028278, '73e4fe389c5e0cf3151c15d3ed64c84343306b85e7392cd9ada18516a029e5c6'],
 [1793581695085, 'bb8a23129fc974d828b615b463a6ad78e7316b4523fa4ef127e99b27440aad49'],
 [1793788961145, '6e4fbfec652ac32b31a924181264663557c87587bf908eeeb91cec7aba84a7c3'],
 [1793879100162, '76fac8491411a5d6d185ceeaea21f76349db8b974d9b47d5e4acd08612d29b68'],
 [1793899854102, 'd7a9ac6e2891c7ef71d9060149ec70f4bcd1af66c1fc433d64e7ebd47be12987'],
 [1793908326585, '5ede759fcb2a7916cb2df98eff1974852ae5ddfcc3c6b9f1fb6775ae9cf3c451'],
 [1794545146148, '2c922674009b7ed809efac9b6fa7dfaf6288543a860c28b847a2f544515bbd5b'],
 [1794585056992, '88e249b4ad08b38abce42f9f1efa1d3178b67bc85cd3727356ceb0d8fc91aff3'],
 [1794623908560, '42d4ef47b0ae2f7e06444a67c6ca5d80e65ed93679c5ad8b99910db2a5713fa0'],
 [1794625337812, '7c68d569af6c173c3d78f2e25dbb1ba0caacdab4dcfab1e8f11aa8fb49b8cda7'],
 [1794643137397, '91fb45fe667fb0d31b014778767084ff2cf045b42a6d1c5385dd44743e68a985'],
 [1794643491167, 'a753b57c1fafb0576faec89c392d39c61945a6af847aaccae17061bca3c96977'],
 [1794644106608, '4389ef20b1bb108d656ea58ff6c12b6b74839f6522c7e3ba81f94d426f35a969'],
 [1794644373767, '7ec2941da2101b4168c25a5d95334e8cfd590a6b281ea6d8bc25e424d1e74d64'],
 [1794644822596, '6bf7441d83eaa2ef7f6336a3cda0d7f80a39c5f6ee487d88935cc9adf9dc3824'],
 [1794644976050, 'a7122c404a62687a2e8d5fddd3e1b7db72e282d1c59606c6eb8d8460d61ad085'],
 [1794646224492, 'edfc0bf8cb3b1bed696f233b75c7508765fc18081d1cc76e6fac3a50e5dfd4ee'],
];
export const PENDING: ReadonlyArray<readonly [number, string]> = [
 [1794663999331, 'ab8260d9c42e60f5e188839f37580e8591473e657272bc4f4e6e478c98042e49'],
 [1794682179689, 'db368d90db8a2538ce288cb92221cf2f1583db0c6de44b63af7f6089549ac465'],
 [1794684199718, 'a0338adbfdfd666827fedac1ea0539d45df186aa06972fb4ab8185c7df05be41'],
 [1794684510330, '9afb969b564147a2476080a0e5c32cfd194a6e280349d618cdd3388ada1ea6cf'],
 [1794684833202, '1bae0d6e04e94879e57be391a3953ba83197dcc79ffa3a40cecb7eb0a7cdb2bf'],
 [1794687691693, 'c61d983b56428c854e054cb165dec2b6418e048c99d4ab539f966d912441bdc6'],
 [1794688351346, '89706d6db177b458a52849f1303e68915c89909cfc70d443b91e7836a5e70a1a'],
 [1794689158352, '919108f68d9533718fae4742ad865ee470ceb5ced46f8cd24157436d7883cee9'],
];
export type JournalRow = { created_at: string | number; hash: string };
export function classifyJournal(rows: JournalRow[]): 'pending' | 'complete' {
 const expected = rows.length === EXPECTED_JOURNAL.length ? EXPECTED_JOURNAL : rows.length === EXPECTED_JOURNAL.length + PENDING.length ? [...EXPECTED_JOURNAL, ...PENDING] : null;
 if (!expected || rows.some((row, i) => Number(row.created_at) !== expected[i][0] || row.hash !== expected[i][1])) throw new Error('UNEXPECTED_MIGRATION_HISTORY');
 return rows.length === EXPECTED_JOURNAL.length ? 'pending' : 'complete';
}
