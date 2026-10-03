"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { SpeechFrame, InterviewerMood } from "@/hooks/useInterviewerSpeech";
import { OCULUS_TO_ARKIT, type OculusViseme } from "@/lib/interviewer/viseme-map";

const MODEL_URL = "/models/interviewer.glb";

interface AvatarProps {
  frameRef: { current: SpeechFrame };
  mood: InterviewerMood;
}

interface FaceMesh {
  influences: number[];
  channels: { name: string; index: number }[];
  hasVisemes: boolean;
}

interface AnimatedBone {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
}

// Clone the skeleton as well as the mesh: the GLTF loader cache must not be
// animated directly, especially when moving between interview layouts.
function prepareCharacter(source: THREE.Group) {
  const model = clone(source);
  const faces: FaceMesh[] = [];
  const bones: Record<string, AnimatedBone> = {};

  model.traverse((object) => {
    if (object instanceof THREE.Bone) {
      bones[object.name.replace(/^mixamorig:?/, "")] = {
        bone: object,
        rest: object.quaternion.clone(),
      };
    }
    if (!(object instanceof THREE.Mesh)) return;

    if (object.morphTargetDictionary && object.morphTargetInfluences) {
      // Keep eye/brow controls independent of speech. Mouth channels are reset
      // every frame so the previous phoneme cannot leave the face distorted.
      faces.push({
        influences: object.morphTargetInfluences,
        channels: Object.entries(object.morphTargetDictionary).map(([name, index]) => ({ name, index })),
        hasVisemes: Object.keys(object.morphTargetDictionary).some((name) => name.startsWith("viseme_")),
      });
      object.morphTargetInfluences.fill(0);
    }

    const tuneMaterial = (original: THREE.Material) => {
      const material = original.clone();
      if (material instanceof THREE.MeshStandardMaterial) {
        // Preserve all original skin, eye, hair and suit texture maps.
        material.envMapIntensity = 0.55;
        if (/body/i.test(material.name)) material.roughness = 0.72;
        if (/high-poly/i.test(material.name)) material.roughness = 0.28;
        if (/teeth/i.test(material.name)) material.roughness = 0.38;
        if (/casualsuit/i.test(material.name)) {
          // Use the original fitted garment and fabric normal map, with a
          // restrained charcoal colour instead of the example's bright logo.
          material.map = null;
          material.color.set("#293646");
          material.roughness = 0.88;
        }
      }
      return material;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(tuneMaterial)
      : tuneMaterial(object.material);
  });

  model.updateMatrixWorld(true);
  const lowerArm = (upperName: string, lowerName: string, direction: THREE.Vector3) => {
    const upper = bones[upperName]?.bone;
    const lower = bones[lowerName]?.bone;
    if (!upper || !lower || !upper.parent) return;
    const from = lower.getWorldPosition(new THREE.Vector3())
      .sub(upper.getWorldPosition(new THREE.Vector3())).normalize();
    const world = upper.getWorldQuaternion(new THREE.Quaternion());
    world.premultiply(new THREE.Quaternion().setFromUnitVectors(from, direction.normalize()));
    const parentInverse = upper.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    upper.quaternion.copy(parentInverse.multiply(world));
    model.updateMatrixWorld(true);
  };
  lowerArm("LeftArm", "LeftForeArm", new THREE.Vector3(0.12, -1, 0.02));
  lowerArm("RightArm", "RightForeArm", new THREE.Vector3(-0.12, -1, 0.02));
  lowerArm("LeftForeArm", "LeftHand", new THREE.Vector3(0.05, -1, 0.1));
  lowerArm("RightForeArm", "RightHand", new THREE.Vector3(-0.05, -1, 0.1));

  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const height = bounds.getSize(new THREE.Vector3()).y;
  const scale = 1.8 / height;
  model.scale.multiplyScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  model.updateMatrixWorld(true);

  // Frame the actual head and shoulders, not the origin at the character's feet.
  const headPosition = bones.Head?.bone.getWorldPosition(new THREE.Vector3());
  const target = new THREE.Vector3(0, headPosition ? headPosition.y - 0.01 : 1.54, 0);

  return { model, faces, bones, target };
}

function HumanInterviewer({ frameRef, mood, onReady }: AvatarProps & { onReady: () => void }) {
  const { scene } = useGLTF(MODEL_URL);
  const character = useMemo(() => prepareCharacter(scene), [scene]);
  const { camera, size } = useThree();
  const blink = useRef({ next: 2.8, elapsed: -1 });
  const rotation = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);

  useEffect(() => {
    onReady();
    return () => {
      // Materials are cloned per instance; geometry and textures remain owned
      // by the loader cache and must stay usable when the layout remounts.
      character.model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
    };
  }, [character.model, onReady]);

  // Fixed portrait camera; keep enough vertical space on narrow coding panels.
  useEffect(() => {
    const distance = size.width / size.height < 0.85 ? 1.35 : 1.15;
    camera.position.set(0, character.target.y + 0.035, distance);
    camera.lookAt(character.target);
    camera.updateProjectionMatrix();
  }, [camera, character.target, size.width, size.height]);

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime;
    const frame = frameRef.current;
    const speechWeights = frame.speaking ? frame.visemeWeights : {};
    const smoothing = 1 - Math.exp(-Math.min(delta, 0.05) * 35);

    const blinkState = blink.current;
    blinkState.next -= delta;
    if (blinkState.next <= 0) {
      blinkState.elapsed = 0;
      blinkState.next = 3 + Math.random() * 2.5;
    }
    let blinkWeight = 0;
    if (blinkState.elapsed >= 0) {
      blinkState.elapsed += delta;
      blinkWeight = Math.sin(Math.min(1, blinkState.elapsed / 0.16) * Math.PI);
      if (blinkState.elapsed >= 0.16) blinkState.elapsed = -1;
    }

    // ARKit-only models can still use the same timing; the bundled model uses
    // its authored Oculus poses on the face, lower teeth and tongue directly.
    const arkit: Record<string, number> = {};
    for (const [viseme, weight] of Object.entries(speechWeights)) {
      const mapping = OCULUS_TO_ARKIT[viseme as OculusViseme];
      if (!mapping) continue;
      for (const [key, value] of Object.entries(mapping)) {
        arkit[key] = (arkit[key] ?? 0) + value * weight;
      }
    }

    for (const face of character.faces) {
      for (const { name, index } of face.channels) {
        let target = 0;
        if (name.startsWith("viseme_")) {
          const viseme = name.slice(7);
          const intensity = viseme === "aa" ? 0.7 : viseme === "PP" ? 1 : 0.85;
          target = (speechWeights[viseme] ?? 0) * intensity;
        } else if (name === "eyeBlinkLeft" || name === "eyeBlinkRight") {
          target = blinkWeight * 0.9;
        } else if (name === "browInnerUp") {
          target = mood === "thinking" ? 0.12 : 0.025;
        } else if (name === "mouthSmileLeft" || name === "mouthSmileRight") {
          target = frame.speaking ? 0 : 0.04;
        } else if (!face.hasVisemes && /^(mouth|jaw|tongue)/.test(name)) {
          target = Math.min(1, arkit[name] ?? 0);
        }
        // External Three.js buffers are intentionally mutated by the renderer.
        // eslint-disable-next-line react-hooks/immutability -- GLTF morph buffers are Three.js state, not React state
        face.influences[index] += (target - face.influences[index]) * smoothing;
      }
    }

    const animateBone = (name: string, x: number, y: number, z: number) => {
      const animated = character.bones[name];
      if (!animated) return;
      rotation.setFromEuler(euler.set(x, y, z));
      animated.bone.quaternion.copy(animated.rest).multiply(rotation);
    };

    // Small skeletal motion keeps the anatomy connected. No independently
    // translated head, artificial jaw hinge or perpetual exaggerated nodding.
    const nod = mood === "listening" ? Math.pow(Math.max(0, Math.sin(time * 0.65)), 12) * 0.025 : 0;
    animateBone("Head", Math.sin(time * 0.8) * 0.008 + nod,
      Math.sin(time * 0.43) * 0.018, Math.sin(time * 0.31) * 0.008);
    animateBone("Spine2", Math.sin(time * 1.15) * 0.004, 0, Math.sin(time * 0.4) * 0.003);
  });

  return <primitive object={character.model} dispose={null} />;
}

export default function InterviewerAvatar(props: AvatarProps) {
  const [loaded, setLoaded] = useState(false);
  const onReady = useCallback(() => setLoaded(true), []);
  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [0, 1.5, 1.3], fov: 30, near: 0.05, far: 20 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        fallback={<div className="p-6 text-sm text-white/70">3D rendering is unavailable in this browser.</div>}
      >
        <ambientLight intensity={0.35} color="#e7ebef" />
        <directionalLight position={[1.8, 3.2, 3]} intensity={2.2} color="#fff0df" />
        <directionalLight position={[-2, 2, 2]} intensity={0.75} color="#dce8ff" />
        <directionalLight position={[0.5, 2.5, -1.5]} intensity={1.3} color="#ffffff" />
        {/* Generated light cards provide eye reflections without an HDR download. */}
        <Environment resolution={64} frames={1}>
          <Lightformer position={[2, 3, 4]} scale={[3, 3, 1]} intensity={2} />
          <Lightformer position={[-3, 2, 3]} scale={[2, 3, 1]} intensity={0.8} color="#dce8ff" />
        </Environment>
        <Suspense fallback={null}>
          <HumanInterviewer {...props} onReady={onReady} />
        </Suspense>
      </Canvas>
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/70">Loading interviewer…</div>
      )}
    </div>
  );
}
