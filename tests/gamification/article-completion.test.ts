import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { gamificationArticleCompletions } from '../../db/schema';
import { sameIds } from '../../lib/gamification/processor-policy';

const writer = readFileSync('app/api/student/articles/[articleId]/progress/route.ts', 'utf8');
const processor = readFileSync('lib/gamification/processor.ts', 'utf8');
describe('article completion proof', () => {
 test('requires exact nonempty unique section sets', () => {
  expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(true);
  expect(sameIds(['a'], ['a', 'b'])).toBe(false);
  expect(sameIds(['a', 'a'], ['a'])).toBe(false);
  expect(sameIds([], [])).toBe(false);
 });
 test('enforces one completion per user, article and version in the database', () => {
  const unique = getTableConfig(gamificationArticleCompletions).uniqueConstraints.find(c => c.name === 'gamification_article_completion_unique');
  expect(unique?.columns.map(c => c.name)).toEqual(['user_id', 'article_id', 'article_version']);
  expect(writer).toContain('onConflictDoNothing().returning()');
  expect(writer).toContain('sourceEvidenceId: completion.id');
 });
 test('processor compares version, section snapshot and captured time boundaries', () => {
  expect(processor).toContain('article.version !== completion.articleVersion');
  expect(processor).toContain('sameIds(completion.sectionIds, sections.map(section => section.id))');
  expect(processor).toContain('sameIds(receipt.details.sectionIds, completion.sectionIds)');
  expect(processor).toContain('new Date(row.completedAt) < start.startedAt');
  expect(processor).toContain('new Date(row.completedAt) > completion.completedAt');
 });
});
