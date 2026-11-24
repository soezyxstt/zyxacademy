import {describe,expect,it} from 'bun:test';
import {resolveReaderBlockTitle} from '@/lib/materials/reader-toc';

describe('Article subsection headings',()=>{
  it('includes a visible fallback heading when author title is missing or blank',()=>{
    expect(resolveReaderBlockTitle(null,'Aktivasi Pengetahuan Awal','Ikhtisar')).toBe('Aktivasi Pengetahuan Awal');
    expect(resolveReaderBlockTitle('   ','Pengantar Masalah','Ikhtisar')).toBe('Pengantar Masalah');
  });
  it('preserves specific headings and mirrors renamed theory headings',()=>{
    expect(resolveReaderBlockTitle('Peta bab','Pengantar Masalah','Ikhtisar')).toBe('Peta bab');
    expect(resolveReaderBlockTitle('Penjelasan inti','Penjelasan','Limit')).toBe('Teori');
  });
  it('omits repeated section titles and hidden boilerplate rather than inventing subsections',()=>{
    for(const title of ['Limit','Penjelasan','Representasi Konseptual','Representasi Matematis','Rumus dan syarat','Simbol, syarat, dan makna'])expect(resolveReaderBlockTitle(title,'Penjelasan','Limit')).toBeNull();
    expect(resolveReaderBlockTitle(null,'Representasi Matematis','Limit')).toBeNull();
  });
});
