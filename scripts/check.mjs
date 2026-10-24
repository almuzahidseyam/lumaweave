import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, extname } from 'node:path';
const root = process.cwd();
for (const folder of ['src', 'popup', 'detector', 'demo', 'scripts', 'test']) {
  for (const name of await readdir(resolve(root, folder), { recursive: true })) {
    if (!['.js','.mjs','.cjs'].includes(extname(name))) continue;
    const result = spawnSync(process.execPath, ['--check', resolve(root, folder, name)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${folder}/${name}: ${result.stderr}`);
  }
}
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(manifest.name, 'LumaWeave');
assert.equal(manifest.version, pkg.version);
assert.deepEqual(manifest.permissions, ['storage']);
const injected = new Set();
for (const group of manifest.content_scripts) {
  assert.deepEqual(group.matches, ['https://meet.google.com/*']);
  for (const file of group.js) {
    assert.ok(!injected.has(file), `A file must not be injected into multiple worlds: ${file}`);
    injected.add(file);
    assert.ok((await stat(file)).isFile(), file);
  }
}
for (const file of [manifest.action.default_popup, ...Object.values(manifest.icons)]) assert.ok((await stat(file)).isFile(), file);
const lock = JSON.parse(await readFile('vendor/manifest.json', 'utf8'));
for (const [name, hash] of Object.entries(lock.sha256)) {
  assert.equal(createHash('sha256').update(await readFile(resolve('vendor', name))).digest('hex'), hash, `Vendor checksum: ${name}`);
}
console.log('PASS JavaScript syntax, manifest paths, minimal permissions, version consistency and bundled vendor checksums');
