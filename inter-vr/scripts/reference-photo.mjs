import { createHash } from "node:crypto";

// Calibrated front-view projection for the supplied 1122 x 1402 portrait.
// Pixel detail is baked into the model's own UVs; the interviewer remains a
// skinned, morph-animated 3D mesh rather than a flat image in the UI.
export async function loadReferencePhoto(path, sharp) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const yAnchors = [[1.80, 105], [1.72, 265], [1.651, 445], [1.609, 545],
    [1.577, 610], [1.565, 636], [1.529, 707], [1.47, 825], [1.41, 945], [1.22, 1380]];
  const gaussian = (v, center, radius) => Math.exp(-(((v - center) / radius) ** 2));
  function pixel([worldX, worldY, worldZ = 0.145]) {
    // Register all surfaces onto one portrait plane. Hair and face sit at
    // different depths; ignoring that difference creates a visible double edge.
    const cameraZ = 1.78, referenceDepth = cameraZ - 0.145;
    const depthScale = referenceDepth / (cameraZ - worldZ);
    const x = worldX * depthScale;
    const y = 1.651 + (worldY - 1.651) * depthScale;
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
    // The supplied portrait's right pupil is slightly higher than its left.
    // Register both pupils with the rig's neutral eye centres, instead of
    // projecting an iris onto the upper eyelid.
    py -= gaussian(y, 1.651, 0.026) * (10 + Math.tanh(x / 0.02) * 5);
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
  const nearestSkinPixels = new Map();
  function personPixel(p) {
    const x = Math.max(0, Math.min(info.width - 1, Math.round(p[0])));
    const y = Math.max(0, Math.min(info.height - 1, Math.round(p[1])));
    const index = y * info.width + x;
    if (!backdrop[index]) return p;
    if (nearestSkinPixels.has(index)) return nearestSkinPixels.get(index);
    for (let radius = 1; radius <= 90; radius++) {
      for (let step = -radius; step <= radius; step++) {
        for (const [dx, dy] of [[step, -radius], [step, radius], [-radius, step], [radius, step]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height || backdrop[ny * info.width + nx]) continue;
          const nearest = [nx, ny]; nearestSkinPixels.set(index, nearest); return nearest;
        }
      }
    }
    return p;
  }
  function skinSample(point) {
    const p = personPixel(pixel(point)), original = samplePixel(p);
    for (const [cx, cy] of [[480, 440], [641, 430]]) {
      const centreX = cx * info.width / 1122, centreY = cy * info.height / 1402;
      const rx = 45 * info.width / 1122, ry = 18 * info.height / 1402;
      const distance = ((p[0] - centreX) / rx) ** 2 + ((p[1] - centreY) / ry) ** 2;
      if (distance > 1.3) continue;
      // Eyeballs carry the reference's irises. Skin UVs underneath a closing
      // lid must contain eyelid skin, otherwise a blink leaves a painted eye.
      const upper = samplePixel([p[0], centreY - 16 * info.height / 1402]);
      const lower = samplePixel([p[0], centreY + 34 * info.height / 1402]);
      const t = Math.max(0, Math.min(1, (p[1] - centreY + ry) / (2 * ry)));
      const lidFeather = Math.max(0, Math.min(1, (p[1] - centreY + 17 * info.height / 1402) / (5 * info.height / 1402)));
      const strength = lidFeather * Math.max(0, Math.min(1, (1.3 - distance) / 0.4));
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
  // A hair mesh must not carry opaque cheek/ear pixels over the facial mesh.
  // Feather the actual portrait's skin boundary instead of cutting a hard
  // second face silhouette into the curtain at the temples.
  const skinBoundary = `<svg width="${info.width}" height="${info.height}" viewBox="0 0 1122 1402" xmlns="http://www.w3.org/2000/svg">
    <rect width="1122" height="1402" fill="white"/>
    <path fill="black" d="M645 258 C589 269 511 325 468 391 C444 419 426 453 417 491 C409 527 421 577 447 623 C482 673 530 699 576 701 C624 696 659 672 690 631 C713 594 728 540 731 487 C736 454 741 416 732 386 C724 329 700 285 645 258 Z"/>
    <rect x="0" y="756" width="1122" height="646" fill="black"/>
  </svg>`;
  const hairMask = await sharp(Buffer.from(skinBoundary)).blur(1.2).removeAlpha().greyscale().raw().toBuffer();
  for (let i = 0; i < backdrop.length; i++) foreground[i * 4 + 3] = backdrop[i] ? 0 : hairMask[i];
  const texture = await sharp(foreground, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 97 }).toBuffer();
  const eyeTexture = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 97 }).toBuffer();
  const eyeUv = ([x, y]) => {
    const left = x < 0;
    return [((left ? 480 : 641) + (x - (left ? -0.03315 : 0.03315)) * 2350) / 1122,
      ((left ? 440 : 430) - (y - 1.65103) * 2350) / 1402];
  };
  return { pixel, sample, samplePixel, skinSample, texture, eyeTexture, eyeUv, width: info.width, height: info.height,
    pixelHash: createHash("sha256").update(data).digest("hex"),
    uv: (point) => { const p = pixel(point); return [p[0] / info.width, p[1] / info.height]; } };
}
