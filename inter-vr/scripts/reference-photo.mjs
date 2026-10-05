// Calibrated front-view projection for the supplied 1122 x 1402 portrait.
// Pixel detail is baked into the model's own UVs; the interviewer remains a
// skinned, morph-animated 3D mesh rather than a flat image in the UI.
export async function loadReferencePhoto(path, sharp) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const yAnchors = [[1.80, 105], [1.72, 265], [1.651, 445], [1.609, 545],
    [1.577, 610], [1.565, 636], [1.529, 707], [1.47, 825], [1.41, 945], [1.22, 1380]];
  const gaussian = (v, center, radius) => Math.exp(-(((v - center) / radius) ** 2));
  function pixel([x, y]) {
    let py = yAnchors[0][1] - (y - yAnchors[0][0]) * 2200;
    for (let i = 0; i < yAnchors.length - 1; i++) {
      const [a, b] = [yAnchors[i], yAnchors[i + 1]];
      if (y <= a[0] && y >= b[0]) {
        py = a[1] + (a[0] - y) / (a[0] - b[0]) * (b[1] - a[1]);
        break;
      }
      if (y < yAnchors.at(-1)[0]) py = yAnchors.at(-1)[1] + (yAnchors.at(-1)[0] - y) * 2200;
    }
    const centre = 565 + gaussian(y, 1.609, 0.02) * 7 - gaussian(y, 1.651, 0.012) * 4;
    return [(centre + x * 2350) * info.width / 1122, py * info.height / 1402];
  }
  function samplePixel(p) {
    const x = Math.max(0, Math.min(info.width - 2, p[0]));
    const y = Math.max(0, Math.min(info.height - 2, p[1]));
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    return [0, 1, 2].map((c) => {
      const a = data[(iy * info.width + ix) * 4 + c], b = data[(iy * info.width + ix + 1) * 4 + c];
      const d = data[((iy + 1) * info.width + ix) * 4 + c], e = data[((iy + 1) * info.width + ix + 1) * 4 + c];
      return (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
    });
  }
  const sample = (point) => samplePixel(pixel(point));
  function skinSample(point) {
    const p = pixel(point), original = samplePixel(p);
    for (const [cx, cy] of [[481, 444], [642, 440]]) {
      const centreX = cx * info.width / 1122, centreY = cy * info.height / 1402;
      const rx = 53 * info.width / 1122, ry = 25 * info.height / 1402;
      const distance = ((p[0] - centreX) / rx) ** 2 + ((p[1] - centreY) / ry) ** 2;
      if (distance > 1.3) continue;
      // Eyeballs carry the reference's irises. Skin UVs underneath a closing
      // lid must contain eyelid skin, otherwise a blink leaves a painted eye.
      const upper = samplePixel([p[0], centreY - 29 * info.height / 1402]);
      const lower = samplePixel([p[0], centreY + 34 * info.height / 1402]);
      const t = Math.max(0, Math.min(1, (p[1] - centreY + ry) / (2 * ry)));
      const strength = p[1] < centreY - 13 * info.height / 1402 ? 0 : Math.max(0, Math.min(1, (1.3 - distance) / 0.3));
      return original.map((value, c) => value * (1 - strength) + (upper[c] * (1 - t) + lower[c] * t) * strength);
    }
    return original;
  }
  // Remove only edge-connected grey-green backdrop. Eye whites and internal
  // highlights remain opaque, unlike a global colour-key threshold.
  const backdrop = new Uint8Array(info.width * info.height);
  const queue = new Int32Array(backdrop.length);
  let start = 0, end = 0;
  const visit = (index) => {
    if (index < 0 || index >= backdrop.length || backdrop[index]) return;
    const p = index * 4;
    if (data[p + 1] < data[p] - 3 || data[p + 1] < data[p + 2] - 3) return;
    backdrop[index] = 1; queue[end++] = index;
  };
  for (let x = 0; x < info.width; x++) { visit(x); visit((info.height - 1) * info.width + x); }
  for (let y = 0; y < info.height; y++) { visit(y * info.width); visit(y * info.width + info.width - 1); }
  while (start < end) {
    const index = queue[start++], x = index % info.width;
    if (x > 0) visit(index - 1);
    if (x < info.width - 1) visit(index + 1);
    visit(index - info.width); visit(index + info.width);
  }
  const foreground = Buffer.from(data);
  for (let i = 0; i < backdrop.length; i++) if (backdrop[i]) foreground[i * 4 + 3] = 0;
  const texture = await sharp(foreground, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 97 }).toBuffer();
  return { pixel, sample, skinSample, texture, width: info.width, height: info.height,
    pixelHash: createHash("sha256").update(data).digest("hex"),
    uv: (point) => { const p = pixel(point); return [p[0] / info.width, p[1] / info.height]; } };
}
import { createHash } from "node:crypto";
