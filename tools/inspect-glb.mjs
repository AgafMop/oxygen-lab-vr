// Usage: node tools/inspect-glb.mjs <file.glb> [--require a,b,c] [--max-tris N] [--max-mb M]
// Exits 1 on any violation. Prints node count, triangles, size.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { statSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args[0];
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const fail = msg => { console.error('FAIL:', msg); process.exitCode = 1; };

if (!file || !existsSync(file)) { fail(`missing file ${file}`); process.exit(1); }

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
const root = doc.getRoot();
const names = new Set(root.listNodes().map(n => n.getName()));

let tris = 0;
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
  }
}
const mb = statSync(file).size / 1048576;
console.log(`${file}: nodes=${names.size} tris=${Math.round(tris)} size=${mb.toFixed(2)}MB`);

const req = opt('--require');
if (req) for (const n of req.split(',')) if (!names.has(n)) fail(`missing node ${n}`);
const maxT = opt('--max-tris'); if (maxT && tris > +maxT) fail(`tris ${Math.round(tris)} > ${maxT}`);
const maxM = opt('--max-mb'); if (maxM && mb > +maxM) fail(`size ${mb.toFixed(2)}MB > ${maxM}MB`);
