"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { SpeechFrame, InterviewerMood } from "@/hooks/useInterviewerSpeech";
import { OCULUS_TO_ARKIT, type OculusViseme } from "@/lib/interviewer/viseme-map";
import { buildSpeechPose } from "@/lib/interviewer/speech-animation";

const MODEL_URL = "/models/interviewer.glb";

interface AvatarProps {
  frameRef: { current: SpeechFrame };
  mood: InterviewerMood;
  onStatusChange?: (status: "loading" | "ready" | "error") => void;
}

export function preloadInterviewerModel() {
  // Shares the exact loader/decoder cache used by the visible character.
  useGLTF.preload(MODEL_URL);
}

interface FaceMesh {
  influences: number[];
  channels: { name: string; index: number }[];
  hasVisemes: boolean;
  visemes: Set<string>;
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
        visemes: new Set(Object.keys(object.morphTargetDictionary).filter((name) => name.startsWith("viseme_")).map((name) => name.slice(7))),
      });
      object.morphTargetInfluences.fill(0);
    }

    const tuneMaterial = (original: THREE.Material) => {
      let material = original.clone();
      if (material instanceof THREE.MeshStandardMaterial) {
        // Preserve all original skin, eye, hair and suit texture maps.
        material.envMapIntensity = 0.4;
        if (/body|skin/i.test(material.name)) {
          // Retain the authored albedo/normal/roughness maps. A broad skin
          // highlight plus a faint oily surface layer avoids the matte doll look.
          const skin = new THREE.MeshPhysicalMaterial();
          THREE.MeshStandardMaterial.prototype.copy.call(skin, material);
          material.dispose();
          skin.metalness = 0;
          skin.roughness = 0.48;
          skin.specularIntensity = 0.55;
          skin.specularColor.set("#ffe9dd");
          skin.clearcoat = 0.08;
          skin.clearcoatRoughness = 0.5;
          material = skin;
        }
        if (material instanceof THREE.MeshStandardMaterial) {
          if (/high-poly|eye/i.test(material.name)) material.roughness = 0.2;
          if (/hair/i.test(material.name)) material.roughness = 0.65;
          if (/teeth/i.test(material.name)) material.roughness = 0.42;
          if (/casualsuit/i.test(material.name)) {
            // Preserve fabric relief with a restrained charcoal colour.
            material.map = null;
            material.color.set("#293646");
            material.roughness = 0.88;
          }
        }
      }
      return material;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(tuneMaterial)
      : tuneMaterial(object.material);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    object.castShadow = !materials.some((material) => material.transparent);
    object.receiveShadow = true;
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
  // Breathing and gestures must start from the relaxed pose, including arms.
  Object.values(bones).forEach(({ bone, rest }) => rest.copy(bone.quaternion));

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
  const { camera, size, gl, scene: renderScene } = useThree();
  const warmup = useRef({ compiled: false, frames: 0, ready: false });
  const blink = useRef({ next: 2.8, elapsed: -1, duration: 0.17 });
  const motion = useRef({
    energy: 0, previousEnergy: 0, speaking: 0, listening: 0, thinking: 0,
    gazeNext: 1.4, gazeX: 0, gazeY: 0, gazeTargetX: 0, gazeTargetY: 0,
    postureNext: 2, pitch: 0, yaw: 0, roll: 0, targetPitch: 0, targetYaw: 0, targetRoll: 0,
    gestureNext: 1.5, gestureTime: -1, gestureDuration: 0.7, gestureStrength: 0,
  });
  const rotation = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);

  useEffect(() => {
    let cancelled = false;
    warmup.current = { compiled: false, frames: 0, ready: false };
    // Compile the skinned/morph-target shaders while the ready screen is open.
    // Readiness is reported after a rendered frame, not merely a GLTF download.
    void gl.compileAsync(renderScene, camera).then(() => {
      if (!cancelled) warmup.current.compiled = true;
    }).catch((error: unknown) => {
      console.warn("[InterviewerAvatar] Shader warmup unavailable", error);
      // The normal render path can still compile synchronously on older GPUs.
      if (!cancelled) warmup.current.compiled = true;
    });
    return () => {
      cancelled = true;
      // Materials are cloned per instance; geometry and textures remain owned
      // by the loader cache and must stay usable when the layout remounts.
      character.model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
    };
  }, [character.model, camera, gl, renderScene]);

  // Fixed portrait camera; keep enough vertical space on narrow coding panels.
  useEffect(() => {
    const distance = size.width / size.height < 0.85 ? 1.35 : 1.15;
    camera.position.set(0, character.target.y + 0.035, distance);
    camera.lookAt(character.target);
    camera.updateProjectionMatrix();
  }, [camera, character.target, size.width, size.height]);

  useFrame(({ clock }, delta) => {
    if (warmup.current.compiled && !warmup.current.ready && ++warmup.current.frames >= 2) {
      warmup.current.ready = true;
      onReady();
    }
    const time = clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    const frame = frameRef.current;
    const speechWeights = frame.speaking ? frame.visemeWeights : {};
    const state = motion.current;
    const damp = (from: number, to: number, speed: number) => THREE.MathUtils.damp(from, to, speed, dt);
    state.previousEnergy = state.energy;
    state.energy = damp(state.energy, frame.speaking ? frame.level : 0, frame.level > state.energy ? 18 : 8);
    state.speaking = damp(state.speaking, frame.speaking ? 1 : 0, 5);
    state.listening = damp(state.listening, mood === "listening" ? 1 : 0, 3);
    state.thinking = damp(state.thinking, mood === "thinking" ? 1 : 0, 3);
    const { visemes, arkit, jawBoost } = buildSpeechPose(speechWeights, state.energy, frame.speaking, !frame.hasVisemeTimeline);

    const blinkState = blink.current;
    blinkState.next -= dt;
    if (blinkState.next <= 0) {
      blinkState.elapsed = 0;
      blinkState.duration = 0.13 + Math.random() * 0.07;
      blinkState.next = Math.random() < 0.12 ? 0.28 : 2.4 + Math.random() * 3.8;
    }
    let blinkWeight = 0;
    if (blinkState.elapsed >= 0) {
      blinkState.elapsed += dt;
      const progress = Math.min(1, blinkState.elapsed / blinkState.duration);
      // Quick lid closure, slower reopening instead of a metronomic blink.
      blinkWeight = progress < 0.35 ? Math.sin(progress / 0.35 * Math.PI / 2) : Math.cos((progress - 0.35) / 0.65 * Math.PI / 2);
      if (progress >= 1) blinkState.elapsed = -1;
    }

    state.gazeNext -= dt;
    if (state.gazeNext <= 0) {
      const glance = Math.random() < (mood === "thinking" ? 0.65 : 0.22);
      state.gazeTargetX = (Math.random() - 0.5) * (glance ? 0.36 : 0.09);
      state.gazeTargetY = (Math.random() - 0.5) * (glance ? 0.18 : 0.05);
      state.gazeNext = glance ? 0.35 + Math.random() * 0.6 : 1.2 + Math.random() * 2.8;
    }
    state.gazeX = damp(state.gazeX, state.gazeTargetX, 14);
    state.gazeY = damp(state.gazeY, state.gazeTargetY, 14);
    const rounded = (speechWeights.O ?? 0) + (speechWeights.U ?? 0) + (speechWeights.PP ?? 0);
    const smile = (0.04 * (1 - state.speaking) + 0.008 * state.speaking) * (1 - Math.min(1, rounded));
    const brow = 0.025 + state.thinking * 0.07 + state.energy * 0.045;

    for (const face of character.faces) {
      // Teeth/tongue have only a subset of facial visemes. Supply the missing
      // jaw component so they follow the lips on I/U/FF instead of staying still.
      let missingJaw = 0;
      if (face.hasVisemes) {
        for (const [viseme, weight] of Object.entries(visemes)) {
          if (!face.visemes.has(viseme)) missingJaw += (OCULUS_TO_ARKIT[viseme as OculusViseme]?.jawOpen ?? 0) * weight;
        }
      }
      for (const { name, index } of face.channels) {
        let target = 0;
        if (name.startsWith("viseme_")) {
          target = visemes[name.slice(7)] ?? 0;
        } else if (name === "jawOpen") {
          target = face.hasVisemes ? jawBoost + missingJaw : arkit.jawOpen ?? 0;
        } else if (name === "eyeBlinkLeft" || name === "eyeBlinkRight") {
          target = blinkWeight;
        } else if (name === "eyeLookOutLeft" || name === "eyeLookInRight") {
          target = Math.max(0, state.gazeX);
        } else if (name === "eyeLookInLeft" || name === "eyeLookOutRight") {
          target = Math.max(0, -state.gazeX);
        } else if (name === "eyeLookUpLeft" || name === "eyeLookUpRight") {
          target = Math.max(0, state.gazeY);
        } else if (name === "eyeLookDownLeft" || name === "eyeLookDownRight") {
          target = Math.max(0, -state.gazeY);
        } else if (name === "browInnerUp") {
          target = brow;
        } else if (name === "browOuterUpLeft" || name === "browOuterUpRight") {
          target = brow * (name.endsWith("Left") ? 0.55 : 0.4);
        } else if (name === "cheekSquintLeft" || name === "cheekSquintRight") {
          target = smile * 0.65 + state.listening * 0.025;
        } else if (name === "mouthSmileLeft" || name === "mouthSmileRight") {
          target = smile * (name.endsWith("Left") ? 1 : 0.85);
        } else if (!face.hasVisemes && /^(mouth|jaw|tongue)/.test(name)) {
          target = Math.min(1, arkit[name] ?? 0);
        }
        const speechChannel = /^(viseme_|jaw|mouth|tongue)/.test(name) && !name.startsWith("mouthSmile");
        // Ease vowels into place; retain a fast attack for brief M/B/P closure.
        const speed = name.startsWith("eyeBlink") ? 70 : speechChannel
          ? (name === "viseme_PP" || name === "mouthClose" ? 60 : target > face.influences[index] ? 32 : 26) : 10;
        const smoothing = 1 - Math.exp(-dt * speed);
        // External Three.js buffers are intentionally mutated by the renderer.
        // eslint-disable-next-line react-hooks/immutability -- GLTF morph buffers are Three.js state, not React state
        face.influences[index] += (Math.min(1, Math.max(0, target)) - face.influences[index]) * smoothing;
      }
    }

    const animateBone = (name: string, x: number, y: number, z: number) => {
      const animated = character.bones[name];
      if (!animated) return;
      rotation.setFromEuler(euler.set(x, y, z));
      rotation.premultiply(animated.rest);
      animated.bone.quaternion.slerp(rotation, 1 - Math.exp(-dt * 8));
    };

    state.postureNext -= dt;
    if (state.postureNext <= 0) {
      state.targetPitch = (Math.random() - 0.5) * 0.035;
      state.targetYaw = (Math.random() - 0.5) * 0.075;
      state.targetRoll = (Math.random() - 0.5) * 0.045;
      state.postureNext = 2.5 + Math.random() * 4;
    }
    state.pitch = damp(state.pitch, state.targetPitch, 1.4);
    state.yaw = damp(state.yaw, state.targetYaw, 1.2);
    state.roll = damp(state.roll, state.targetRoll, 1.2);
    state.gestureNext -= dt;
    const emphasis = frame.speaking && state.energy > 0.22 && (state.energy - state.previousEnergy) / Math.max(dt, 0.001) > 1.5;
    if (state.gestureNext <= 0 && state.gestureTime < 0 && (emphasis || mood === "listening")) {
      state.gestureTime = 0;
      state.gestureDuration = 0.55 + Math.random() * 0.35;
      state.gestureStrength = (mood === "listening" ? 0.045 : 0.022 + state.energy * 0.025);
      state.gestureNext = mood === "listening" ? 3 + Math.random() * 4 : 0.9 + Math.random() * 1.5;
    }
    let nod = 0;
    if (state.gestureTime >= 0) {
      state.gestureTime += dt;
      const progress = Math.min(1, state.gestureTime / state.gestureDuration);
      nod = Math.sin(progress * Math.PI) ** 2 * state.gestureStrength;
      if (progress >= 1) state.gestureTime = -1;
    }
    const breath = Math.sin(time * 1.35) * 0.006 + Math.sin(time * 0.73) * 0.002;
    const sway = Math.sin(time * 0.38) * 0.006 + Math.sin(time * 0.61) * 0.003;
    const pitch = state.pitch + nod - state.listening * 0.012;
    animateBone("Head", pitch * 0.7 + breath * 0.4, state.yaw + state.gazeX * 0.08, state.roll + state.thinking * 0.018);
    animateBone("Neck", pitch * 0.3, state.yaw * 0.3, state.roll * 0.25);
    animateBone("Spine", breath * 0.35, sway * 0.3, sway * 0.4);
    animateBone("Spine1", breath * 0.4 - state.listening * 0.005, state.yaw * 0.08, sway * 0.5);
    animateBone("Spine2", breath + nod * 0.12, state.yaw * 0.12, sway);
    animateBone("LeftShoulder", 0, 0, breath * 0.6);
    animateBone("RightShoulder", 0, 0, -breath * 0.6);
  });

  return <primitive object={character.model} dispose={null} />;
}

export default function InterviewerAvatar(props: AvatarProps) {
  const [loaded, setLoaded] = useState(false);
  const { onStatusChange } = props;
  const onReady = useCallback(() => {
    setLoaded(true);
    onStatusChange?.("ready");
  }, [onStatusChange]);
  useEffect(() => { onStatusChange?.("loading"); }, [onStatusChange]);
  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [0, 1.5, 1.3], fov: 30, near: 0.05, far: 20 }}
        dpr={[1, 2]}
        shadows="soft"
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1;
        }}
        fallback={<div className="p-6 text-sm text-white/70">3D rendering is unavailable in this browser.</div>}
      >
        <ambientLight intensity={0.16} color="#e7ebef" />
        <directionalLight position={[-1.8, 2.7, 3]} intensity={1.9} color="#fff2e7"
          castShadow shadow-mapSize={[2048, 2048]} shadow-normalBias={0.003} shadow-bias={-0.00015}
          shadow-camera-left={-1.2} shadow-camera-right={1.2}
          shadow-camera-top={2.2} shadow-camera-bottom={-0.2}
          shadow-camera-near={0.1} shadow-camera-far={8} />
        <directionalLight position={[2, 2, 2]} intensity={0.45} color="#e5edff" />
        <directionalLight position={[0.5, 2.5, -1.5]} intensity={0.65} color="#ffffff" />
        {/* Generated light cards provide eye reflections without an HDR download. */}
        <Environment resolution={128} frames={1}>
          <Lightformer position={[-2, 3, 4]} scale={[3, 3, 1]} intensity={1.5} color="#fff2e7" />
          <Lightformer position={[3, 2, 3]} scale={[2, 3, 1]} intensity={0.6} color="#e5edff" />
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
