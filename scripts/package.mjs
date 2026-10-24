// Deterministic, dependency-free ZIP of only the installable extension files.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const manifest = JSON.parse(await readFile('manifest.json','utf8'));
const prefix = `lumaweave-${manifest.version}/`;
const names = ['manifest.json','README.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md','docs/privacy.md','docs/বাংলা-ব্যবহারবিধি.md','docs/preview.png'];
for (const folder of ['src','popup','icons','detector','vendor','demo']) {
  for (const item of await readdir(folder,{recursive:true,withFileTypes:true})) {
    if (!item.isFile()) continue;
    names.push(resolve(item.parentPath,item.name).slice(process.cwd().length + 1).replaceAll('\\','/'));
  }
}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++) n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes) {let crc=0xffffffff;for(const value of bytes)crc=crcTable[(crc^value)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const local=[],central=[];
let offset=0;
for(const name of names.sort()) {
  const filename=Buffer.from(prefix+name),data=await readFile(name),compressed=deflateRawSync(data,{level:9}),crc=crc32(data);
  const head=Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt16LE(8,8);
  head.writeUInt16LE(33,12);head.writeUInt32LE(crc,14);head.writeUInt32LE(compressed.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(filename.length,26);
  local.push(head,filename,compressed);
  const directory=Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);
  directory.writeUInt16LE(8,10);directory.writeUInt16LE(33,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(compressed.length,20);
  directory.writeUInt32LE(data.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);
  central.push(directory,filename);
  offset+=head.length+filename.length+compressed.length;
}
const centralBytes=Buffer.concat(central),end=Buffer.alloc(22);
end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(names.length,8);end.writeUInt16LE(names.length,10);
end.writeUInt32LE(centralBytes.length,12);end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...local,centralBytes,end]);
await mkdir('dist',{recursive:true});
const filename=`lumaweave-${manifest.version}.zip`;
await writeFile('dist/'+filename,archive);
await writeFile('dist/SHA256SUMS.txt',`${createHash('sha256').update(archive).digest('hex')}  ${filename}\n`);
console.log(`Built dist/${filename}: ${names.length} files, ${(archive.length/1024/1024).toFixed(1)} MiB. Fixed ZIP timestamps are used for reproducible builds.`);
