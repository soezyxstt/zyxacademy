import { expect, test } from 'bun:test';
import { allocateChecklistXp, courseCreditMicro } from '../../lib/gamification/policy';
import type { ChecklistCategory } from '../../lib/gamification/contracts';

test('reference and half sized courses preserve exact pools and credits', () => {
 const pool = (category: ChecklistCategory, count: number) => [...allocateChecklistXp(category, Array.from({ length: count }, (_, i) => String(i).padStart(4, '0'))).values()].reduce((a, b) => a + b, 0);
 expect(pool('article', 10) + pool('explanation', 10) + pool('question', 300) + pool('flashcard', 200)).toBe(10_000_000_000);
 const total = pool('article', 5) + pool('explanation', 10) + pool('question', 150) + pool('flashcard', 100);
 expect(total).toBe(5_500_000_000);
 expect(courseCreditMicro(total)).toBe(550_000);
 expect(courseCreditMicro(20_000_000_000)).toBe(1_000_000);
});
test('allocation rejects duplicate identities and distributes remainder by ID', () => {
 expect(() => allocateChecklistXp('article', ['a', 'a'])).toThrow();
 const result = allocateChecklistXp('article', Array.from({ length: 11 }, (_, i) => String(i).padStart(2, '0')));
 expect(result.get('00')).toBe(90_909_091);
 expect(result.get('10')).toBe(90_909_090);
 expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(1_000_000_000);
});
