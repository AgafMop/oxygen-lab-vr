// Usage: node tools/optimize.mjs <in.glb> <out.glb>
// Dedup, weld, meshopt compression, webp textures. Keeps empty nodes (anchors/stations).
import { execFileSync } from 'node:child_process';

const [src, dst] = process.argv.slice(2);
if (!src || !dst) { console.error('usage: optimize <in.glb> <out.glb>'); process.exit(2); }
execFileSync(process.execPath, ['node_modules/@gltf-transform/cli/bin/cli.js', 'optimize', src, dst,
  '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '2048',
  '--prune', 'false', '--simplify', 'false', '--instance', 'false', '--join', 'false',
  '--flatten', 'false', '--palette', 'false'], { stdio: 'inherit' });
