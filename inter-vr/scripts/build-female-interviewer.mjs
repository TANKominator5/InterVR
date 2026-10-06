// Offline asset authoring. See public/models/README.txt for tools and CC0 inputs.
// This writes a separate GLB; the approved interviewer.glb is only read.
import { createRequire } from "node:module";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { buildReferenceHair } from "./reference-hair-strands.mjs";
import { referenceSkin } from "./reference-skin.mjs";
import { loadReferencePhoto } from "./reference-photo.mjs";

const argument = (name) => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes("--tools") || !process.argv.includes("--reference")) {
  throw new Error("Usage: node scripts/build-female-interviewer.mjs --tools <tool installation directory> --reference <reference image> [--source <full-resolution source GLB>]");
}
const requireTool = createRequire(resolve(argument("--tools"), "package.json"));
const { NodeIO } = requireTool("@gltf-transform/core");
const { ALL_EXTENSIONS, KHRMaterialsUnlit } = requireTool("@gltf-transform/extensions");
const { dequantize, dedup, prune, meshopt } = requireTool("@gltf-transform/functions");
const { MeshoptDecoder, MeshoptEncoder } = requireTool("meshoptimizer");
const { mat4, mat3, vec3 } = requireTool("gl-matrix");
const sharp = requireTool("sharp");
const photo = await loadReferencePhoto(argument("--reference"), sharp);
const savedReference = resolve("assets/interviewer/female-reference.webp");
if (resolve(argument("--reference")) !== savedReference) await sharp(argument("--reference")).webp({ lossless: true }).toFile(savedReference);
const input = process.argv.includes("--source") ? resolve(argument("--source")) : resolve("public/models/interviewer.glb");
const output = resolve("public/models/interviewer-female-photo.glb");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const document = await io.read(input);
await document.transform(dequantize());
const root = document.getRoot();
const unlit = photo ? document.createExtension(KHRMaterialsUnlit) : undefined;
const photoTexture = photo ? document.createTexture("Bella.reference_portrait").setMimeType("image/webp").setImage(photo.texture) : undefined;
const buffer = root.listBuffers()[0];
const head = root.listNodes().find((node) => node.getName() === "Head");
if (!head) throw new Error("Source avatar has no Head joint");

// Reference proportions: oval face, softer cheeks, almond eyes, a narrower
// nose and gently fuller relaxed lips. Keep all authored expressions aligned.
// Apply the same deformation to every facial part and every expression, so
// teeth, blink shapes and authored speech poses remain aligned.
const gaussian = (value, center, radius) => Math.exp(-(((value - center) / radius) ** 2));
function sculpt([x, y, z]) {
  const front = Math.min(1, Math.max(0, (z - 0.035) / 0.065));
  const face = gaussian(y, 1.62, 0.12) * front;
  const jaw = gaussian(y, 1.548, 0.034);
  const cheek = gaussian(y, 1.616, 0.034) * gaussian(Math.abs(x), 0.045, 0.023);
  const nose = gaussian(x, 0, 0.019) * gaussian(y, 1.62, 0.031) * Math.min(1, Math.max(0, (z - 0.132) / 0.023));
  const mouth = gaussian(y, 1.577, 0.021) * gaussian(x, 0, 0.047) * front;
  const lowerLip = gaussian(y, 1.568, 0.007) * gaussian(x, 0, 0.026) * front;
  const upperLip = gaussian(y, 1.587, 0.007) * gaussian(x, 0, 0.025) * front;
  const corners = gaussian(Math.abs(x), 0.029, 0.01) * gaussian(y, 1.577, 0.014) * front;
  const eye = gaussian(Math.abs(x), 0.034, 0.025) * gaussian(y, 1.651, 0.024) * front;
  const eyeOpening = gaussian(y, 1.659, 0.006) * 0.0009 - gaussian(y, 1.643, 0.006) * 0.00035;
  return [x * (1 - jaw * face * 0.055 - mouth * 0.11 - nose * 0.09)
      + Math.tanh(x / 0.018) * (cheek * face * 0.0038 + eye * 0.001),
    y + corners * 0.0022 + upperLip * 0.001 - lowerLip * 0.0012 + eye * eyeOpening,
    z - nose * 0.0055 + cheek * face * 0.0022 + lowerLip * 0.003 + upperLip * 0.002];
}
function normalTransform(point, matrix, inverse) {
  const origin = vec3.transformMat4([], point, matrix);
  const jacobian = new Float64Array(9);
  const step = 0.0001;
  for (let axis = 0; axis < 3; axis++) {
    const before = [...origin], after = [...origin];
    before[axis] -= step; after[axis] += step;
    const a = sculpt(before), b = sculpt(after);
    for (let c = 0; c < 3; c++) jacobian[axis * 3 + c] = (b[c] - a[c]) / (2 * step);
  }
  const local = mat3.multiply(mat3.create(), mat3.fromMat4(mat3.create(), inverse),
    mat3.multiply(mat3.create(), jacobian, mat3.fromMat4(mat3.create(), matrix)));
  const normal = mat3.invert(mat3.create(), local);
  return mat3.transpose(normal, normal);
}
function vertexMatrices(node, primitive) {
  const skin = node.getSkin();
  const inverseBind = skin.getInverseBindMatrices();
  const joints = skin.listJoints().map((joint, i) =>
    mat4.multiply(mat4.create(), joint.getWorldMatrix(), inverseBind.getElement(i, [])));
  const weights = primitive.getAttribute("WEIGHTS_0");
  const indices = primitive.getAttribute("JOINTS_0");
  return Array.from({ length: weights.getCount() }, (_, i) => {
    const matrix = new Float64Array(16);
    const w = weights.getElement(i, []), j = indices.getElement(i, []);
    for (let k = 0; k < 4; k++) for (let c = 0; c < 16; c++) matrix[c] += joints[j[k]][c] * w[k];
    const inverse = mat4.invert(mat4.create(), matrix);
    if (!inverse) throw new Error("Non-invertible skin transform");
    return { matrix, inverse };
  });
}
let faceSurface;
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh || !node.getSkin() || /ponytail|casualsuit/.test(node.getName())) continue;
  for (const primitive of mesh.listPrimitives()) {
    if (mesh.getName() === "high-poly") {
      const matrices = vertexMatrices(node, primitive), positions = primitive.getAttribute("POSITION");
      const uv = Array.from({ length: positions.getCount() }, (_, i) =>
        photo.eyeUv(vec3.transformMat4([], positions.getElement(i, []), matrices[i].matrix)));
      primitive.getAttribute("TEXCOORD_0").setArray(new Float32Array(uv.flat())).setNormalized(false);
      const eyeTexture = document.createTexture("Bella.reference_eye_detail").setMimeType("image/webp").setImage(photo.eyeTexture);
      primitive.getMaterial().setBaseColorTexture(eyeTexture).setBaseColorFactor([1, 1, 1, 1]).setAlphaMode("OPAQUE")
        .setExtension("KHR_materials_unlit", unlit.createUnlit());
      // Keep spherical geometry and authored gaze shapes. Iris registration
      // uses each eye's own neutral centre, independent of the face/hair warp.
      continue;
    }
    if (/eyelashes/.test(node.getName())) {
      primitive.getMaterial().setBaseColorFactor([0.025, 0.017, 0.01, 1]).setRoughnessFactor(0.85);
    }
    const positions = primitive.getAttribute("POSITION");
    const matrices = vertexMatrices(node, primitive);
    const original = Array.from({ length: positions.getCount() }, (_, i) => positions.getElement(i, []));
    const edited = original.map((point, i) => vec3.transformMat4([], sculpt(vec3.transformMat4([], point, matrices[i].matrix)), matrices[i].inverse));
    if (mesh.getName() === "base") {
      faceSurface = {
        positions: edited.map((point, i) => vec3.transformMat4([], point, matrices[i].matrix)),
        uvs: original.map((_, i) => primitive.getAttribute("TEXCOORD_0").getElement(i, [])),
        indices: Array.from(primitive.getIndices().getArray()),
      };
    }
    positions.setArray(new Float32Array(edited.flat())).setNormalized(false);
    const normals = primitive.getAttribute("NORMAL");
    const originalNormals = Array.from({ length: normals.getCount() }, (_, i) => normals.getElement(i, []));
    const editedNormals = originalNormals.map((normal, i) => vec3.normalize([], vec3.transformMat3([], normal,
      normalTransform(original[i], matrices[i].matrix, matrices[i].inverse))));
    normals.setArray(new Float32Array(editedNormals.flat())).setNormalized(false);
    for (const target of primitive.listTargets()) {
      const deltas = target.getAttribute("POSITION");
      if (!deltas) continue;
      const values = new Float32Array(deltas.getCount() * 3);
      const normalDeltas = target.getAttribute("NORMAL");
      const normalValues = normalDeltas ? new Float32Array(normalDeltas.getCount() * 3) : undefined;
      for (let i = 0; i < deltas.getCount(); i++) {
        const delta = deltas.getElement(i, []);
        const absolute = original[i].map((value, c) => value + delta[c]);
        const posed = vec3.transformMat4([], sculpt(vec3.transformMat4([], absolute, matrices[i].matrix)), matrices[i].inverse);
        for (let c = 0; c < 3; c++) values[i * 3 + c] = posed[c] - edited[i][c];
        if (normalDeltas) {
          const deltaNormal = normalDeltas.getElement(i, []);
          const absoluteNormal = originalNormals[i].map((value, c) => value + deltaNormal[c]);
          const mapped = vec3.normalize([], vec3.transformMat3([], absoluteNormal,
            normalTransform(absolute, matrices[i].matrix, matrices[i].inverse)));
          for (let c = 0; c < 3; c++) normalValues[i * 3 + c] = mapped[c] - editedNormals[i][c];
        }
      }
      deltas.setArray(values).setNormalized(false);
      if (normalDeltas) normalDeltas.setArray(normalValues).setNormalized(false);
    }
  }
}

// Retain the full-resolution young skin scan rather than the grey adult blend.
const skinMaterial = root.listMaterials().find((material) => /\.body$/.test(material.getName()));
const skinTexture = skinMaterial.getBaseColorTexture();
skinTexture.setName("Bella.reference_skin").setMimeType("image/webp")
  .setImage(await referenceSkin({ image: skinTexture.getImage(), surface: faceSurface, sharp, photo }));
if (photo) skinMaterial.setBaseColorFactor([1, 1, 1, 1]).setExtension("KHR_materials_unlit", unlit.createUnlit());
// The reference already contains its skin detail and studio illumination.
skinMaterial.setNormalTexture(null);
for (const material of root.listMaterials()) if (/casualsuit/.test(material.getName())) material.setBaseColorTexture(null);
for (const texture of root.listTextures()) {
  if (texture === skinTexture || texture === photoTexture) continue;
  texture.setImage(await sharp(texture.getImage()).resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 92 }).toBuffer()).setMimeType("image/webp");
}

// Replace the blunt bob with a layered wavy side-part silhouette.
for (const node of root.listNodes()) {
  if (/ponytail|eyebrows|eyelashes/.test(node.getName())) node.dispose();
}
await buildReferenceHair({ document, head, buffer, mat4, vec3, photo, photoTexture, unlit });
root.setExtras({ ...root.getExtras(), interviewer: "Bella", recipe: "reference-projected animated 3D portrait",
  reference: { width: photo.width, height: photo.height, pixelHash: photo.pixelHash } });
await document.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
await io.write(output, document);
console.log(`Female interviewer written: ${output} (${((await stat(output)).size / 1024 / 1024).toFixed(2)} MB)`);
