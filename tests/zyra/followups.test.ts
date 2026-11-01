import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FollowupParser, validateFollowups, FOLLOWUPS_OPEN, FOLLOWUPS_CLOSE } from '../../lib/zyra/followups.ts';

const item = { label: 'Try an example', prompt: 'Can we try another example?', icon: 'example', intent: 'practice' };
test('split delimiters never leak and valid metadata is parsed', () => {
  const parser = new FollowupParser();
  const input = `Answer${FOLLOWUPS_OPEN}${JSON.stringify([item])}${FOLLOWUPS_CLOSE}`;
  let visible = '';
  for (const char of input) visible += parser.push(char);
  const result = parser.finish();
  assert.equal(visible + result.text, 'Answer');
  assert.deepEqual(result.followups, [item]);
});
test('incomplete and malformed metadata is hidden', () => {
  for (const metadata of ['{bad}', JSON.stringify([item])]) {
    const parser = new FollowupParser();
    assert.equal(parser.push('Answer' + FOLLOWUPS_OPEN + metadata), 'Answer');
    assert.deepEqual(parser.finish().followups, []);
  }
});
test('rejects invalid fields and oversized collections', () => {
  for (const value of [[{ ...item, icon: 'bad' }], [{ ...item, intent: 'solve' }], [{ ...item, label: 'x'.repeat(49) }], [{ ...item, prompt: 'x'.repeat(241) }], Array(4).fill(item)]) assert.deepEqual(validateFollowups(value), []);
  assert.deepEqual(validateFollowups([]), []);
});
test('plain text is retained', () => {
  const parser = new FollowupParser();
  assert.equal(parser.push('Answer <zyra-') + parser.finish().text, 'Answer ');
});
