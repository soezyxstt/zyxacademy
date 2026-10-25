import {expect,it} from 'bun:test';
import {sanitizeAnswer} from '@/lib/tutor/answer-sanitizer';
it('preserves executable Python calls, lists, indentation and repeated operators while cleaning prose',()=>{
 const code='```python\ndata = input()\nif data.isdigit():\n    values = []\n    if int(data) != 0:\n        print(2 ** int(data))\n```';
 const result=sanitizeAnswer('Tinjau  kode ().\n\n'+code+'\nGunakan `input()` dan `[]`.');
 expect(result).toContain(code);
 expect(result).toContain('`input()`');expect(result).toContain('`[]`');
 expect(result).toContain('Tinjau kode.');
});
it('still removes internal citation IDs inside code instead of bypassing redaction',()=>{
 const result=sanitizeAnswer('```python\n# [article-product-secret]\nprint(input())\n```');
 expect(result).not.toContain('article-product-secret');
 expect(result).toContain('print(input())');
});
