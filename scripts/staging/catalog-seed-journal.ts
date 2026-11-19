import { classifyJournal, EXPECTED_JOURNAL, PENDING, type JournalRow } from './gamification-migration-core';

// Staging's migration journal includes two historical bridge entries.
const suffix: ReadonlyArray<readonly [number, string]> = [
  [1794779543997, '4daa59e714c25b571a2f5e723324194a6ba1534870782fb4e0ce02aee6ae9d34'],
  [1794780730200, '90590e585eff3c6819f8cfe39bee6c5ee62ef45db9c0b1341b4cf4324db01998'],
  [1794782055615, 'fd93740e20a45f6b672fb61b1d8487f1b31c7f58af4ddbce3c20d88fcf85547e'],
  [1794783786784, 'ef1fecba4ac9025e751096516a3c7d87e166faf9196269978f2992b560ca9eda'],
  [1794788099039, 'd4e965ff711226581ca6b61b75a534de183fa072748f03eb93a8029d7ca67241'],
  [1794798612483, 'c07cee04c8d80bdf7cbdc3f0491bdf1d91a19e6ec5c88d02df8470ebae2e4dc9'],
  [1794802396688, 'ccefe455f94546ce8fc33d7cc137890d01cc115a3604d03ae25902cb5fc80b0b'],
  [1794806584386, 'ed76b5f9ae29300d85b9ed1ca941f741bbbc0572be043a163cee26d75a53461c'],
  [1794810408552, 'd206eca760fe660495d09c35c0b7e7a9ec891affa7ffed9413f28484afbae373'],
  [1794816019981, '1f4860765acf3d9356c4830513c7b3a892efe111526679064437c1bbafa1be6c'],
  [1794823859346, '2b9ea082707c26feec117d895ac622614746d16377fe46a8c805ef5f5809f677'],
  [1795109679359, '7436deb3c2fba323939de959c4021fa6acd52f226d6d94363113bffab1f18b04'],
  [1795116616448, '8bbff58789fab43c4ab6b17d217bac2d87690a1e9b07101e79c0bc2e06216b5a'],
];

export function assertCatalogSeedJournal(rows: JournalRow[]) {
  const prefixLength = EXPECTED_JOURNAL.length + PENDING.length;
  // Catalog reconciliation is safe before and after the additive pet profile migration.
  const expected = rows.length === prefixLength + suffix.length - 1 ? suffix.slice(0, -1) : suffix;
  if (rows.length !== prefixLength + expected.length ||
      classifyJournal(rows.slice(0, prefixLength)) !== 'complete' ||
      expected.some(([time, hash], index) => {
        const row = rows[prefixLength + index];
        return Number(row.created_at) !== time || row.hash !== hash;
      })) throw new Error('UNEXPECTED_MIGRATION_HISTORY');
}
