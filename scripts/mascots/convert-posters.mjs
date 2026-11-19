import { readdir, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Supply rendered PNG directory and output posters directory.');
await mkdir(output,{recursive:true});
const reports=[];
for(const name of (await readdir(input)).filter((name)=>name.endsWith('.png')).sort()) {
  const filename=name.replace(/\.png$/,'.webp');
  const bytes=await sharp(path.join(input,name)).webp({quality:92,effort:6,alphaQuality:100}).toBuffer();
  await writeFile(path.join(output,filename),bytes);
  reports.push({path:filename,bytes:bytes.length,width:640,height:640});
}
await writeFile(path.join(output,'poster-manifest.json'),JSON.stringify({schemaVersion:1,posters:reports},null,2)+'\n');
console.log(JSON.stringify(reports));
