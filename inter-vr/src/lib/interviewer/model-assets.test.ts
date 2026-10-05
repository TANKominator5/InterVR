import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { INTERVIEWERS } from "./profiles";

interface ModelMetadata {
  meshes: { name: string; extras?: { targetNames?: string[] } }[];
  nodes: { name?: string }[];
}

async function model(path: string) {
  const bytes = await readFile(new URL(`../../..${path}`, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, "valid GLB header");
  assert.equal(bytes.readUInt32LE(4), 2, "glTF 2.0");
  assert.equal(bytes.readUInt32LE(8), bytes.length, "complete asset");
  const jsonLength = bytes.readUInt32LE(12);
  const metadata = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as ModelMetadata;
  return { bytes, metadata };
}

test("the male interviewer uses the exact approved asset", async () => {
  const { bytes } = await model(`/public${INTERVIEWERS.male.modelUrl}`);
  const digest = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  assert.equal(digest, "78fd6075e927d95704734215bf6436e76170fa67");
});

test("the separate female asset retains all authored speech and facial channels", async () => {
  assert.notEqual(INTERVIEWERS.female.modelUrl, INTERVIEWERS.male.modelUrl);
  const source = (await model(`/public${INTERVIEWERS.male.modelUrl}`)).metadata;
  const female = (await model(`/public${INTERVIEWERS.female.modelUrl}`)).metadata;
  const sourceFace = source.meshes.find((mesh) => mesh.name === "base")!;
  const femaleFace = female.meshes.find((mesh) => mesh.name === "base")!;
  assert.deepEqual(femaleFace.extras?.targetNames, sourceFace.extras?.targetNames);
  for (const bone of ["Head", "Neck", "Spine", "Spine1", "Spine2", "LeftArm", "RightArm"]) {
    assert.ok(female.nodes.some((node) => node.name === bone), bone);
  }
  assert.ok(female.meshes.some((mesh) => mesh.name === "Bella.reference_bob"));
  assert.ok(!female.nodes.some((node) => /ponytail/.test(node.name ?? "")));
});
