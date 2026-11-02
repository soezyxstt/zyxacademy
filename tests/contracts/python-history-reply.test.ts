import {expect,test} from 'bun:test';
import {pythonHistoryReply} from '../../lib/coding/python-reply';

test('unframed generation uses recovery guidance rather than persisting an unclassified program',()=>{
 for(const language of ['id','en'] as const){
  const result=pythonHistoryReply('print(99)',language);
  expect(result).not.toContain('print(99)');
  expect(result).toContain(language==='id'?'mode Tutor':'Tutor mode');
 }
});

test('framed generation preserves explanation and regeneration guidance without storing its program',()=>{
 const result=pythonHistoryReply('A loop.\n```python\nprint(99)\n```','en');
 expect(result).toContain('A loop.');
 expect(result).toContain('generate it again');
 expect(result).not.toContain('print(99)');
});
