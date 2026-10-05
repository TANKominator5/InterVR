// Bake restrained brows, cheek warmth and rose lip colour into the facial UVs.
// These details follow the existing facial morphs rather than floating overlays.
export async function referenceSkin({ image, surface, sharp, photo }) {
  const size = 4096;
  const pixels = await sharp(image).resize(size, size).ensureAlpha().raw().toBuffer();
  const { positions, uvs, indices } = surface;
  const gaussian = (v, center, radius) => Math.exp(-(((v - center) / radius) ** 2));
  const clamp = (v) => Math.max(0, Math.min(1, v));
  function paint(index, [x, y, z], px, py) {
    if (photo && y >= 1.43 && Math.abs(x) <= 0.115 && z >= 0.018) {
      // The source rig's neck is wider than the portrait below the jaw. Sample
      // the clean neck region there instead of projecting shirt/background
      // pixels onto the exposed neckline.
      const neck = clamp((1.51 - y) / 0.045);
      const color = photo.skinSample([x * (1 - neck * 0.4), Math.max(y, 1.452), z]);
      const front = clamp((z - 0.018) / 0.045);
      for (let c = 0; c < 3; c++) pixels[index + c] = Math.round(pixels[index + c] * (1 - front) + color[c] * front);
      return;
    }
    if (z < 0.065 || y < 1.51 || y > 1.715 || Math.abs(x) > 0.079) return;
    const blend = (color, amount) => {
      for (let c = 0; c < 3; c++) pixels[index + c] = Math.round(pixels[index + c] * (1 - amount) + color[c] * amount);
    };
    const cheek = gaussian(Math.abs(x), 0.046, 0.024) * gaussian(y, 1.61, 0.026);
    blend([203, 115, 104], cheek * 0.085);
    const lips = gaussian(x, 0, 0.032) * (gaussian(y, 1.569, 0.006) + gaussian(y, 1.587, 0.005));
    blend([174, 88, 87], Math.min(0.2, lips * 0.2));
    const arch = 1.663 + gaussian(Math.abs(x), 0.043, 0.019) * 0.006;
    const taper = clamp((Math.abs(x) - 0.01) / 0.005) * clamp((0.063 - Math.abs(x)) / 0.008);
    const thickness = 0.0027 * (1 - clamp((Math.abs(x) - 0.042) / 0.023) * 0.5);
    const brow = gaussian(y, arch, thickness) * taper;
    // Sub-pixel density variation softens the brow boundary into fine hairs.
    const strand = 0.82 + Math.sin(px * 1.8 + py * 0.7) * 0.1;
    blend([66, 44, 31], brow * strand * 0.86);
  }
  for (let i = 0; i < indices.length; i += 3) {
    const ids = indices.slice(i, i + 3);
    const points = ids.map((id) => positions[id]);
    if (points.every((p) => p[1] < (photo ? 1.43 : 1.51) || (!photo && p[1] > 1.72) || p[2] < (photo ? 0.018 : 0.065))) continue;
    const uv = ids.map((id) => uvs[id].map((v) => v * size));
    const [a, b, c] = uv;
    const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(denominator) < 0.00001) continue;
    const minX = Math.max(0, Math.floor(Math.min(...uv.map((p) => p[0]))));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(...uv.map((p) => p[0]))));
    const minY = Math.max(0, Math.floor(Math.min(...uv.map((p) => p[1]))));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(...uv.map((p) => p[1]))));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const u = ((b[1] - c[1]) * (x + 0.5 - c[0]) + (c[0] - b[0]) * (y + 0.5 - c[1])) / denominator;
      const v = ((c[1] - a[1]) * (x + 0.5 - c[0]) + (a[0] - c[0]) * (y + 0.5 - c[1])) / denominator;
      const w = 1 - u - v;
      if (Math.min(u, v, w) < 0) continue;
      paint((y * size + x) * 4, [0, 1, 2].map((axis) => points[0][axis] * u + points[1][axis] * v + points[2][axis] * w), x, y);
    }
  }
  return sharp(pixels, { raw: { width: size, height: size, channels: 4 } }).webp({ quality: 94 }).toBuffer();
}
