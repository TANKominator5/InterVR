// Reference-guided strand geometry. All curves are baked into the GLB offline.
// A single Head binding follows the existing gaze, nod and posture animation.
export async function buildReferenceHair({ document, head, buffer, mat4, vec3, photo, photoTexture, unlit }) {
  let randomState = 17391;
  const random = () => {
    randomState = Math.imul(randomState, 1664525) + 1013904223 | 0;
    return (randomState >>> 0) / 4294967296;
  };
  const positions = [], normals = [], colors = [], uvs = [], indices = [];
  const centre = [0.003, 1.665, 0.065], radius = [0.095, 0.134, 0.135];
  const point = (theta, phi) => [
    centre[0] + radius[0] * Math.sin(phi) * Math.sin(theta),
    centre[1] + radius[1] * Math.cos(phi),
    centre[2] + radius[2] * Math.sin(phi) * Math.cos(theta),
  ];
  const hairline = (theta) => {
    const front = Math.max(0, Math.cos(theta));
    const left = Math.max(0, -Math.sin(theta));
    const part = Math.exp(-(((Math.atan2(Math.sin(theta), Math.cos(theta)) - 0.3) / 0.35) ** 2));
    return 1.43 - front * 0.27 + left * front * 0.23 - part * front * 0.065;
  };
  const linear = (v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const dark = [96, 55, 37].map((v) => linear(v / 255));
  const light = [164, 103, 69].map((v) => linear(v / 255));
  const color = (mix) => dark.map((v, c) => v + (light[c] - v) * mix);
  function addVertex(p, n, c, uv) {
    const index = positions.length / 3;
    positions.push(...p); normals.push(...n); colors.push(...(photo ? [1, 1, 1] : c)); uvs.push(...(photo ? photo.uv(p) : uv));
    return index;
  }
  // The underneath crown has a rounded skull-fitting shape. Dense strands
  // cover its edge, so it never reads as a separate helmet or cut-out sheet.
  const rows = 19, columns = 84;
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const theta = column / columns * Math.PI * 2;
    const phi = row / rows * (hairline(theta) + (row === rows ? Math.sin(theta * 37) * 0.005 : 0));
    const p = point(theta, phi);
    const n = vec3.normalize([], p.map((v, c) => (v - centre[c]) / (radius[c] * radius[c])));
    addVertex(p, n, color(0.12), [column / columns, row / rows]);
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = row * (columns + 1) + column, b = a + columns + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const capCount = indices.length;
  // A fitted curtain supplies continuous bob volume underneath the fine fibres.
  // Reference-derived strand detail is carried by its photo-projected UVs.
  const curtainStart = positions.length / 3, curtainRows = 22, curtainColumns = 86;
  for (let row = 0; row <= curtainRows; row++) for (let column = 0; column <= curtainColumns; column++) {
    const t = row / curtainRows, theta = 0.79 + column / curtainColumns * (Math.PI * 2 - 1.58);
    const left = Math.sin(theta) < 0;
    const rootWidth = 0.09, middleWidth = left ? 0.132 : 0.108, endWidth = left ? 0.087 : 0.073;
    const width = t < 0.5 ? rootWidth + (middleWidth - rootWidth) * Math.sin(t * Math.PI)
      : endWidth + (middleWidth - endWidth) * Math.sin(t * Math.PI);
    const depth = 0.128 - t * 0.044;
    const p = [Math.sin(theta) * width, 1.705 - t * 0.174 + Math.sin(theta * 3) * t * t * 0.002,
      centre[2] + Math.cos(theta) * depth];
    const n = vec3.normalize([], [Math.sin(theta), 0.12, Math.cos(theta)]);
    addVertex(p, n, color(0.16), [column / curtainColumns, t]);
  }
  for (let row = 0; row < curtainRows; row++) for (let column = 0; column < curtainColumns; column++) {
    const a = curtainStart + row * (curtainColumns + 1) + column, b = a + curtainColumns + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  function part(z, side) {
    const x = 0.025 + side * (0.0012 + random() * 0.001);
    const normalized = Math.max(0, 1 - ((x - centre[0]) / radius[0]) ** 2 - ((z - centre[2]) / radius[2]) ** 2);
    return [x, centre[1] + radius[1] * Math.sqrt(normalized) + 0.001, z];
  }
  function curve(knots, t) {
    const section = Math.min(knots.length - 2, Math.floor(t * (knots.length - 1)));
    const u = t * (knots.length - 1) - section;
    const p0 = knots[Math.max(0, section - 1)], p1 = knots[section];
    const p2 = knots[section + 1], p3 = knots[Math.min(knots.length - 1, section + 2)];
    return [0, 1, 2].map((c) => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * u
      + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u * u
      + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u * u * u));
  }
  function rotate(v, axis, angle) {
    const cross = vec3.cross([], axis, v), dot = vec3.dot(axis, v);
    return v.map((value, c) => value * Math.cos(angle) + cross[c] * Math.sin(angle) + axis[c] * dot * (1 - Math.cos(angle)));
  }
  const strandCount = photo ? 500 : 1600, segments = 22, sides = 3;
  for (let strand = 0; strand < strandCount; strand++) {
    const kind = random(), variation = random(), phase = random() * Math.PI * 2;
    let knots;
    if (kind < 0.2) {
      // Front-facing fibres sweep from the offset part across the crown, rather
      // than leaving an untextured solid patch above the forehead.
      const theta = -1.22 + variation * 2.28;
      const start = part(-0.035 + random() * 0.13, Math.sin(theta) < 0 ? -1 : 1);
      const end = point(theta, hairline(theta) * (0.995 + random() * 0.013));
      const from = vec3.normalize([], start.map((v, c) => (v - centre[c]) / radius[c]));
      const to = vec3.normalize([], end.map((v, c) => (v - centre[c]) / radius[c]));
      const angle = Math.acos(Math.max(-1, Math.min(1, vec3.dot(from, to))));
      knots = Array.from({ length: 7 }, (_, i) => {
        const t = i / 6;
        const a = angle < 0.0001 ? 1 - t : Math.sin((1 - t) * angle) / Math.sin(angle);
        const b = angle < 0.0001 ? t : Math.sin(t * angle) / Math.sin(angle);
        return from.map((v, c) => centre[c] + (v * a + to[c] * b) * radius[c] * 1.013);
      });
    } else if (kind < 0.39) {
      // Longer, fuller sweep on the viewer's left. The fringe passes above the
      // eye before falling beside the cheek and curling in under the jaw.
      const z = 0.026 + variation * 0.079;
      const spread = (random() - 0.5) * 0.011;
      knots = [part(z, -1), [-0.014 + spread, 1.789, 0.079 + variation * 0.06],
        [-0.051 + spread, 1.751, 0.126 + variation * 0.025],
        [-0.083 + spread, 1.684, 0.137 + variation * 0.02],
        [-0.126 + spread, 1.611, 0.091 + variation * 0.04],
        [-0.112 + spread, 1.555, 0.061 + variation * 0.03],
        [-0.087 + spread, 1.529 + random() * 0.013, 0.047 + variation * 0.03]];
    } else if (kind < 0.51) {
      // The reference's right side is less voluminous and tucked behind the ear.
      const z = 0.025 + variation * 0.08, spread = (random() - 0.5) * 0.008;
      knots = [part(z, 1), [0.056 + spread, 1.767, 0.075 + variation * 0.053],
        [0.089 + spread, 1.700, 0.112 + variation * 0.016],
        [0.105 + spread, 1.628, 0.04 + variation * 0.032],
        [0.094 + spread, 1.568, 0.011 + variation * 0.034],
        [0.074 + spread, 1.532 + random() * 0.016, 0.009 + variation * 0.023]];
    } else {
      const theta = 0.82 + random() * (Math.PI * 2 - 1.64);
      const side = Math.sin(theta) < 0 ? -1 : 1;
      const root = point(theta, 1.25), middle = point(theta, 0.58);
      const sin = Math.sin(theta), cos = Math.cos(theta);
      const width = side < 0 ? 0.13 : 0.106;
      const z = centre[2] + cos * 0.082;
      knots = [part(z, side), middle, root,
        [sin * width, 1.627, centre[2] + cos * 0.121],
        [sin * width * 0.9, 1.563, centre[2] + cos * 0.112],
        [sin * width * 0.72, 1.527 + random() * 0.02, centre[2] + cos * 0.08]];
    }
    const strandColor = color(0.27 + random() * 0.13);
    const strandRadius = 0.00035 + random() * 0.00024;
    const start = positions.length / 3;
    let previousTangent, normal;
    for (let section = 0; section <= segments; section++) {
      const t = section / segments;
      const p = curve(knots, t);
      // Very fine waviness and length variation break up a manufactured edge.
      const wave = Math.sin(t * Math.PI * 3 + phase) * 0.00065 * Math.sin(t * Math.PI);
      p[0] += wave; p[2] += wave * 0.7;
      if (p[1] > 1.703) {
        // Project any inward curve onto the skull-fitting crown. This prevents
        // sparse roots or scalp intersections without changing the silhouette.
        const q = p.map((v, c) => (v - centre[c]) / radius[c]);
        const distance = Math.hypot(...q);
        if (distance < 1.008) for (let c = 0; c < 3; c++) p[c] = centre[c] + q[c] / distance * radius[c] * 1.008;
      }
      const tangent = vec3.normalize([], vec3.subtract([], curve(knots, Math.min(1, t + 0.001)), curve(knots, Math.max(0, t - 0.001))));
      if (!normal) normal = vec3.normalize([], vec3.cross([], tangent, Math.abs(tangent[2]) < 0.8 ? [0, 0, 1] : [0, 1, 0]));
      else {
        const axis = vec3.cross([], previousTangent, tangent), length = vec3.length(axis);
        if (length > 0.00001) normal = rotate(normal, vec3.scale([], axis, 1 / length), Math.acos(Math.max(-1, Math.min(1, vec3.dot(previousTangent, tangent)))));
      }
      const binormal = vec3.normalize([], vec3.cross([], tangent, normal));
      const r = strandRadius * (1 - Math.max(0, (t - 0.78) / 0.22) * 0.85);
      for (let side = 0; side < sides; side++) {
        const angle = side / sides * Math.PI * 2;
        const n = normal.map((v, c) => v * Math.cos(angle) + binormal[c] * Math.sin(angle));
        const c = strandColor.map((v) => v * (0.68 + Math.sin(t * Math.PI / 2) * 0.32));
        addVertex(p.map((v, axis) => v + n[axis] * r), n, c, [side / sides, t]);
      }
      previousTangent = tangent;
    }
    for (let section = 0; section < segments; section++) for (let side = 0; side < sides; side++) {
      const a = start + section * sides + side, b = start + section * sides + (side + 1) % sides;
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const count = positions.length / 3;
  const joints = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  const accessor = (name, type, array) => document.createAccessor(name, buffer).setType(type).setArray(array);
  const material = document.createMaterial("Bella.hair_reference").setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0).setRoughnessFactor(0.55).setDoubleSided(true);
  if (photo) material.setBaseColorTexture(photoTexture).setAlphaMode("MASK").setAlphaCutoff(0.15)
    .setExtension("KHR_materials_unlit", unlit.createUnlit());
  const primitive = document.createPrimitive().setMaterial(material)
    .setAttribute("POSITION", accessor("hair.position", "VEC3", new Float32Array(positions)))
    .setAttribute("NORMAL", accessor("hair.normal", "VEC3", new Float32Array(normals)))
    .setAttribute("COLOR_0", accessor("hair.color", "VEC3", new Float32Array(colors)))
    .setAttribute("TEXCOORD_0", accessor("hair.uv", "VEC2", new Float32Array(uvs)))
    .setAttribute("JOINTS_0", accessor("hair.joints", "VEC4", joints))
    .setAttribute("WEIGHTS_0", accessor("hair.weights", "VEC4", weights))
    .setIndices(accessor("hair.indices", "SCALAR", new Uint32Array(indices)));
  const inverse = mat4.invert(mat4.create(), head.getWorldMatrix());
  const skin = document.createSkin("Bella.hair_binding").addJoint(head)
    .setInverseBindMatrices(accessor("hair.inverseBind", "MAT4", new Float32Array(inverse)));
  document.getRoot().listScenes()[0].addChild(document.createNode("Bella.hair_reference")
    .setMesh(document.createMesh("Bella.reference_bob").addPrimitive(primitive)).setSkin(skin));
  console.log(`Reference bob: ${strandCount} individually shaded strands, ${count} vertices, ${capCount / 3} crown triangles`);
}
