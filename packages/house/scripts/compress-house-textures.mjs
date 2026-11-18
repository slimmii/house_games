/** Build the download variant: GPU-compressed textures and quantized geometry. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { quantizeHouseGeometry } from './quantize-house-geometry.mjs';
import { houseGeometrySha256 } from './house-geometry-hash.mjs';

const run = promisify(execFile);
const encoder = process.env.TOKTX ?? 'toktx';
// `ktx` (same KTX-Software release) decodes ETC1S output for the quality check.
const ktxTool = process.env.KTX ?? (isAbsolute(encoder) ? join(dirname(encoder), 'ktx') : 'ktx');
const sourcePath = resolve('public/models/house.glb');
const outputPath = resolve('public/models/house-gpu.glb');
const cachePath = resolve('node_modules/.cache/house-ktx2');
const collisionPath = resolve('src/shared/house-collision.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const collisionHash = hash(await readFile(collisionPath));
const source = await readFile(sourcePath);

// Deployment builds need only the prepared assets, not the native encoder.
if (process.argv.includes('--verify')) {
  const report = JSON.parse(await readFile('public/models/house-gpu-manifest.json', 'utf8'));
  assert.equal(hash(source), report.sourceSha256, 'House source changed. Run npm run compress:house.');
  assert.equal(hash(await readFile(outputPath)), report.outputSha256, 'Compressed house is missing or changed. Run npm run compress:house.');
  assert.equal(collisionHash, report.collisionSha256, 'Collision source changed. Run npm run compress:house.');
  console.log('Compressed house matches the current original model and collision data.');
  process.exit(0);
}

function unpack(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67,
    'Expected a GLB. Run git lfs pull if house.glb is still a Git LFS pointer.');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const length = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  assert.equal(bytes.readUInt32LE(24 + length), 0x004e4942);
  return { json: JSON.parse(bytes.subarray(20, 20 + length)), bin: bytes.subarray(28 + length) };
}

function pack(json, bin) {
  const text = Buffer.from(JSON.stringify(json));
  const paddedJSON = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20);
  text.copy(paddedJSON);
  const output = Buffer.alloc(28 + paddedJSON.length + bin.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedJSON.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  paddedJSON.copy(output, 20);
  output.writeUInt32LE(bin.length, 20 + paddedJSON.length);
  output.writeUInt32LE(0x004e4942, 24 + paddedJSON.length);
  bin.copy(output, 28 + paddedJSON.length);
  return output;
}

const original = unpack(source);
const json = structuredClone(original.json);
assert.ok(!json.extensionsUsed?.includes('KHR_texture_basisu'), 'Always compress the original house.glb.');
const versionOutput = await run(encoder, ['--version']);
const version = (versionOutput.stdout || versionOutput.stderr).trim();
assert.ok(version, 'Texture encoder did not report its version');
await mkdir(cachePath, { recursive: true });

// Determine transfer functions from glTF material slots, not PNG metadata.
const colorSlots = new Set(['baseColorTexture', 'emissiveTexture', 'sheenColorTexture', 'specularColorTexture']);
const spaces = new Map();
function collectSlots(value) {
  for (const [key, child] of Object.entries(value ?? {})) {
    if (!child || typeof child !== 'object') continue;
    if (key.endsWith('Texture') && Number.isInteger(child.index)) {
      const imageIndex = json.textures[child.index].source;
      const uses = spaces.get(imageIndex) ?? new Set();
      uses.add(colorSlots.has(key) ? 'srgb' : 'linear');
      spaces.set(imageIndex, uses);
    } else collectSlots(child);
  }
}
json.materials.forEach(collectSlots);

function memoryBytes(width, height, compressed) {
  let bytes = 0;
  while (true) {
    bytes += compressed ? Math.ceil(width / 4) * Math.ceil(height / 4) * 16 : width * height * 4;
    if (width === 1 && height === 1) return bytes;
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
  }
}

const ETC1S = ['--encode', 'etc1s', '--clevel', '4', '--qlevel', '255'];
const UASTC = ['--encode', 'uastc', '--uastc_quality', '3', '--uastc_rdo_l', '1', '--uastc_rdo_d', '65536', '--zcmp', '19'];
const ETC1S_MIN_PSNR = 38;
// Blender bakes and photos carry no detail the drone camera resolves beyond
// 2048 px; the stair brick sheet keeps its metric mortar lines at full size.
const MAX_SIZE = 2048;
const FULL_SIZE = /^Stair brick \//;

async function encodeVariant(pixels, options) {
  const key = hash(Buffer.concat([pixels, Buffer.from(JSON.stringify({ version, options }))]));
  const input = resolve(cachePath, `${key}.png`);
  const output = resolve(cachePath, `${key}.ktx2`);
  try { return await readFile(output); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeFile(input, pixels);
  await run(encoder, [...options, `${output}.tmp`, input], { maxBuffer: 1024 * 1024, env: { ...process.env, TOKTX_OPTIONS: '' } });
  await rename(`${output}.tmp`, output);
  return readFile(output);
}

/** Decode the top mip level with KTX-Software and compare it with the encoder input. */
async function measurePsnr(pixels, encoded, alpha) {
  const key = hash(Buffer.concat([pixels, encoded]));
  const cached = resolve(cachePath, `${key}.psnr`);
  try { return Number(await readFile(cached, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const ktx = resolve(cachePath, `${key}.decode.ktx2`);
  const png = resolve(cachePath, `${key}.decode.png`);
  await writeFile(ktx, encoded);
  await run(ktxTool, ['extract', '--transcode', 'rgba8', ktx, png], { maxBuffer: 1024 * 1024 });
  const channels = alpha ? 4 : 3;
  const read = async image => (await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  const [expected, actual] = await Promise.all([read(pixels), read(png)]);
  assert.equal(actual.info.width, expected.info.width);
  let error = 0;
  let count = 0;
  for (let i = 0; i < expected.data.length; i += 4) {
    for (let c = 0; c < channels; c++) {
      const d = expected.data[i + c] - actual.data[i + c];
      error += d * d;
      count++;
    }
  }
  const psnr = error ? 10 * Math.log10(255 * 255 * count / error) : 99;
  await Promise.all([rm(ktx), rm(png), writeFile(cached, String(psnr))]);
  return psnr;
}

const replacements = new Map();
const images = [];
async function encodeImage(index) {
  const image = json.images[index];
  assert.ok(Number.isInteger(image.bufferView), 'Only embedded house images are supported.');
  const view = original.json.bufferViews[image.bufferView];
  assert.equal(view.buffer, 0);
  const bytes = original.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const source = await sharp(bytes).metadata();
  const { hasAlpha } = source;
  assert.ok(source.width && source.height);
  const uses = spaces.get(index);
  // glTF KTX2 needs multiples of four; UVs are normalised, so rounding the
  // size by a few pixels (or capping it) keeps the mapping.
  const scale = FULL_SIZE.test(image.name) ? 1 : Math.min(1, MAX_SIZE / Math.max(source.width, source.height));
  const width = Math.max(4, Math.round(source.width * scale / 4) * 4);
  const height = Math.max(4, Math.round(source.height * scale / 4) * 4);
  const reason = uses?.size !== 1 ? 'Unused or mixed color-space texture' : undefined;
  let encoded;
  let format;
  let psnr;
  if (!reason) {
    const colorSpace = [...uses][0];
    const common = ['--t2', '--genmipmap', '--assign_oetf', colorSpace, '--assign_primaries', 'bt709',
      '--upper_left_maps_to_s0t0', '--target_type', hasAlpha ? 'RGBA' : 'RGB', '--threads', '4'];
    const pixels = width === source.width && height === source.height && image.mimeType === 'image/png'
      ? bytes : await sharp(bytes).resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
    // Prefer the much smaller ETC1S when it stays close to the source; detailed
    // photos and sharp patterns fall back to rate-distortion optimised UASTC.
    encoded = await encodeVariant(pixels, [...common, ...ETC1S]);
    psnr = await measurePsnr(pixels, encoded, hasAlpha);
    format = psnr >= ETC1S_MIN_PSNR ? 'ETC1S' : 'UASTC';
    if (format === 'UASTC') encoded = await encodeVariant(pixels, [...common, ...UASTC]);
    assert.equal(encoded.readUInt32LE(20), width, 'Encoder changed image width');
    assert.equal(encoded.readUInt32LE(24), height, 'Encoder changed image height');
    assert.equal(encoded.readUInt32LE(40), Math.floor(Math.log2(Math.max(width, height))) + 1, 'Missing mipmaps');
    replacements.set(image.bufferView, encoded);
    image.mimeType = 'image/ktx2';
    for (const texture of json.textures) {
      if (texture.source !== index) continue;
      texture.extensions = { ...texture.extensions, KHR_texture_basisu: { source: index } };
      delete texture.source;
    }
  }
  images[index] = { index, name: image.name, sourceWidth: source.width, sourceHeight: source.height, width, height,
    compressed: !reason, format, etc1sPsnr: psnr && Math.round(psnr * 10) / 10, reason,
    originalBytes: bytes.length, encodedBytes: encoded?.length ?? bytes.length,
    rgbaWithMipmapsBytes: memoryBytes(width, height, false),
    gpuWithMipmapsBytes: memoryBytes(width, height, !reason) };
  console.log(`[${index + 1}/${json.images.length}] ${reason ? 'Original' : format}: ${image.name} (${width}×${height})`);
}
let nextImage = 0;
// Two encoders overlap independent work without loading every large image at once.
await Promise.all([0, 1].map(async () => {
  while (nextImage < json.images.length) await encodeImage(nextImage++);
}));

assert.ok(replacements.size, 'No textures were compressed');
// Repack image and geometry views independently. Preserve the already-compressed
// meshopt payload byte-for-byte, including the separate virtual fallback buffer.
const chunks = [];
let offset = 0;
function append(bytes) {
  const start = offset;
  chunks.push(bytes);
  const padding = (4 - bytes.length % 4) % 4;
  if (padding) chunks.push(Buffer.alloc(padding));
  offset += bytes.length + padding;
  return start;
}
for (const [index, view] of json.bufferViews.entries()) {
  const old = original.json.bufferViews[index];
  if (view.buffer === 0) {
    const bytes = replacements.get(index)
      ?? original.bin.subarray(old.byteOffset ?? 0, (old.byteOffset ?? 0) + old.byteLength);
    view.byteOffset = append(bytes);
    view.byteLength = bytes.length;
  }
  const compressed = view.extensions?.EXT_meshopt_compression;
  if (compressed) {
    assert.equal(compressed.buffer, 0);
    const bytes = original.bin.subarray(compressed.byteOffset ?? 0, (compressed.byteOffset ?? 0) + compressed.byteLength);
    compressed.byteOffset = append(bytes);
  }
}
json.buffers[0].byteLength = offset;
json.extensionsUsed = [...(json.extensionsUsed ?? []), 'KHR_texture_basisu'];
json.extensionsRequired = [...(json.extensionsRequired ?? []), 'KHR_texture_basisu'];
const textured = pack(json, Buffer.concat(chunks));
const checked = unpack(textured);

// Prove all non-image payloads and every unrelated JSON property are unchanged.
for (const [index, view] of original.json.bufferViews.entries()) {
  const next = checked.json.bufferViews[index];
  const slice = (bin, descriptor) => bin.subarray(descriptor.byteOffset ?? 0, (descriptor.byteOffset ?? 0) + descriptor.byteLength);
  if (view.buffer === 0 && !replacements.has(index)) assert.deepEqual(slice(original.bin, view), slice(checked.bin, next));
  if (view.extensions?.EXT_meshopt_compression) {
    assert.deepEqual(slice(original.bin, view.extensions.EXT_meshopt_compression), slice(checked.bin, next.extensions.EXT_meshopt_compression));
  }
}
const unchanged = structuredClone(checked.json);
for (const key of ['images', 'textures', 'buffers', 'bufferViews', 'extensionsUsed', 'extensionsRequired']) {
  if (key in original.json) unchanged[key] = original.json[key];
  else delete unchanged[key];
}
assert.deepEqual(unchanged, original.json, 'Geometry, transforms, materials or other scene properties changed');
assert.equal(hash(await readFile(sourcePath)), hash(source), 'Original asset changed');
assert.equal(hash(await readFile(collisionPath)), collisionHash, 'Collision data changed');
const geometry = await quantizeHouseGeometry(textured);
const output = geometry.output;
await writeFile(`${outputPath}.tmp`, output);
await rename(`${outputPath}.tmp`, outputPath);
const sum = key => images.reduce((total, image) => total + image[key], 0);
const report = {
  source: 'house.glb', output: 'house-gpu.glb', sourceSha256: hash(source), outputSha256: hash(output),
  geometrySha256: await houseGeometrySha256(output),
  collisionSha256: collisionHash, encoder: version,
  settings: `ETC1S (clevel 4, qlevel 255) where its PSNR >= ${ETC1S_MIN_PSNR} dB, else UASTC quality 3 with RDO lambda 1 and Zstandard 19; full mipmaps; sizes rounded to multiples of four, capped at ${MAX_SIZE} px except the stair brick sheet`,
  sourceBytes: source.length, outputBytes: output.length,
  compressedImages: replacements.size, originalImages: images.length - replacements.size,
  estimatedTextureMemory: { rgbaWithMipmapsBytes: sum('rgbaWithMipmapsBytes'),
    astc4x4OrBC7WithMipmapsBytes: sum('gpuWithMipmapsBytes'),
    note: 'Texture payload estimates only. Actual format depends on GPU support; uncompressed fallback remains possible.' },
  geometry: { positions: 'normalized int16 per accessor', normals: 'normalized int8', other: 'unchanged',
    maxPositionError: geometry.maxError, positionAccessors: geometry.positionAccessors },
  materialPropertiesUnchanged: true, images,
};
await writeFile('public/models/house-gpu-manifest.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ compressed: report.compressedImages, original: report.originalImages,
  beforeMiB: sum('rgbaWithMipmapsBytes') / 1024 ** 2, afterMiB: sum('gpuWithMipmapsBytes') / 1024 ** 2 }, null, 2));
