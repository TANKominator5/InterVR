"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AntiCheatStatus {
  yaw: number;
  pitch: number;
  roll: number;
  gazeX: number; // 0–1 horizontal iris ratio (0.5 = center)
  gazeY: number; // 0–1 vertical iris ratio  (0.5 = center)
  isFlagged: boolean;
  isLookingAway: boolean;
  isGazeOffCenter: boolean;
  isReady: boolean;
}

const DEFAULT_STATUS: AntiCheatStatus = {
  yaw: 0,
  pitch: 0,
  roll: 0,
  gazeX: 0.5,
  gazeY: 0.5,
  isFlagged: false,
  isLookingAway: false,
  isGazeOffCenter: false,
  isReady: false,
};

// ── Thresholds ─────────────────────────────────────────────────────────────────

const YAW_THRESHOLD = 15; // degrees (tightened from 25)
const PITCH_THRESHOLD = 12; // degrees (tightened from 20)
const GAZE_EDGE_THRESHOLD = 0.15; // extreme 15% on either side

// ── Landmark Indices ───────────────────────────────────────────────────────────

// Iris landmarks (5 points each)
const LEFT_IRIS_INDICES = [468, 469, 470, 471, 472];
const RIGHT_IRIS_INDICES = [473, 474, 475, 476, 477];

// Eye socket boundary landmarks
const LEFT_EYE_INNER = 133; // inner corner of left eye
const LEFT_EYE_OUTER = 33; // outer corner of left eye
const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;

const RIGHT_EYE_INNER = 362; // inner corner of right eye
const RIGHT_EYE_OUTER = 263; // outer corner of right eye
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;

// ── Math Utilities ─────────────────────────────────────────────────────────────

/**
 * Decompose a 4×4 column-major facial transformation matrix into Euler angles.
 * MediaPipe returns this as a flat Float32Array of length 16 in column-major order.
 *
 * The matrix layout (column-major):
 *   [ r00, r10, r20, 0,
 *     r01, r11, r21, 0,
 *     r02, r12, r22, 0,
 *     tx,  ty,  tz,  1 ]
 *
 * We extract yaw (Y-rotation), pitch (X-rotation), roll (Z-rotation).
 */
export function extractYawPitchRoll(matrix: { data: number[] }): {
  yaw: number;
  pitch: number;
  roll: number;
} {
  const m = matrix.data;

  // Column-major indexing: element at row r, col c = m[c * 4 + r]
  const r00 = m[0];
  const r10 = m[1];
  const r20 = m[2];
  const r01 = m[4];
  const r11 = m[5];
  const r21 = m[6];
  const r02 = m[8];
  const r12 = m[9];
  const r22 = m[10];

  const RAD2DEG = 180 / Math.PI;

  // Euler angle decomposition (XYZ convention)
  let pitch: number, yaw: number, roll: number;

  if (Math.abs(r20) < 0.99999) {
    // General case
    yaw = Math.asin(-clamp(r20, -1, 1)) * RAD2DEG;
    pitch = Math.atan2(r21, r22) * RAD2DEG;
    roll = Math.atan2(r10, r00) * RAD2DEG;
  } else {
    // Gimbal lock
    yaw = (r20 < 0 ? Math.PI / 2 : -Math.PI / 2) * RAD2DEG;
    pitch = Math.atan2(-r12, r11) * RAD2DEG;
    roll = 0;
  }

  return { yaw, pitch, roll };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute the iris position as a ratio within the eye socket.
 * Returns { x, y } where 0.5 means centered.
 *
 * @param landmarks - Full face landmarks array from MediaPipe.
 * @param side - 'left' or 'right' eye.
 */
export function computeIrisRatio(
  landmarks: Array<{ x: number; y: number; z: number }>,
  side: "left" | "right",
): { x: number; y: number } {
  const irisIndices = side === "left" ? LEFT_IRIS_INDICES : RIGHT_IRIS_INDICES;
  const innerIdx = side === "left" ? LEFT_EYE_INNER : RIGHT_EYE_INNER;
  const outerIdx = side === "left" ? LEFT_EYE_OUTER : RIGHT_EYE_OUTER;
  const topIdx = side === "left" ? LEFT_EYE_TOP : RIGHT_EYE_TOP;
  const bottomIdx = side === "left" ? LEFT_EYE_BOTTOM : RIGHT_EYE_BOTTOM;

  // Compute iris center (mean of 5 iris landmarks)
  let irisCx = 0,
    irisCy = 0;
  for (const idx of irisIndices) {
    irisCx += landmarks[idx].x;
    irisCy += landmarks[idx].y;
  }
  irisCx /= irisIndices.length;
  irisCy /= irisIndices.length;

  // Eye socket boundaries
  const inner = landmarks[innerIdx];
  const outer = landmarks[outerIdx];
  const top = landmarks[topIdx];
  const bottom = landmarks[bottomIdx];

  // Horizontal ratio: where is the iris between inner and outer corner?
  const eyeWidth = outer.x - inner.x;
  const x = eyeWidth !== 0 ? (irisCx - inner.x) / eyeWidth : 0.5;

  // Vertical ratio: where is the iris between top and bottom?
  const eyeHeight = bottom.y - top.y;
  const y = eyeHeight !== 0 ? (irisCy - top.y) / eyeHeight : 0.5;

  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
}

// ── Head Pose from Landmarks (Fallback) ────────────────────────────────────────

/**
 * Fallback head pose estimation using 6 canonical landmarks and a simplified
 * perspective projection model. Used when facialTransformationMatrixes is
 * unavailable.
 *
 * Landmarks used:
 *   Nose tip (1), Chin (152), Left eye left corner (33),
 *   Right eye right corner (263), Left mouth corner (61),
 *   Right mouth corner (291)
 */
const MODEL_POINTS_3D = [
  [0.0, 0.0, 0.0], // Nose tip
  [0.0, -330.0, -65.0], // Chin
  [-225.0, 170.0, -135.0], // Left eye left corner
  [225.0, 170.0, -135.0], // Right eye right corner
  [-150.0, -150.0, -125.0], // Left mouth corner
  [150.0, -150.0, -125.0], // Right mouth corner
] as const;

const LANDMARK_INDICES_FOR_POSE = [1, 152, 33, 263, 61, 291];

export function estimateHeadPoseFromLandmarks(
  landmarks: Array<{ x: number; y: number; z: number }>,
  imageWidth: number,
  imageHeight: number,
): { yaw: number; pitch: number; roll: number } {
  // Extract the 2D projections of our 6 key landmarks (normalized → pixel coords)
  const points2D = LANDMARK_INDICES_FOR_POSE.map((idx) => ({
    x: landmarks[idx].x * imageWidth,
    y: landmarks[idx].y * imageHeight,
  }));

  // Simple geometric estimation using nose-to-chin vector and eye-to-eye vector
  const nose = points2D[0];
  const chin = points2D[1];
  const leftEye = points2D[2];
  const rightEye = points2D[3];
  const leftMouth = points2D[4];
  const rightMouth = points2D[5];

  // ── Yaw (left/right head turn) ──
  // Compare the distance from nose to left eye vs nose to right eye.
  // When perfectly centered, these should be equal.
  const noseToLeftEye = Math.hypot(nose.x - leftEye.x, nose.y - leftEye.y);
  const noseToRightEye = Math.hypot(nose.x - rightEye.x, nose.y - rightEye.y);
  const eyeToEye = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);

  // Asymmetry ratio: 0 when centered, positive when turned right, negative for left
  const asymmetry =
    eyeToEye > 0 ? (noseToRightEye - noseToLeftEye) / eyeToEye : 0;
  // Map asymmetry to approximate yaw angle (calibrated for typical webcam FOV)
  const yaw = asymmetry * 90; // rough mapping: 0.5 asymmetry ≈ 45°

  // ── Pitch (up/down nod) ──
  // Use the vertical position of the nose relative to the eye midpoint and chin
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const faceHeight = chin.y - eyeMidY;
  const noseRelative = faceHeight > 0 ? (nose.y - eyeMidY) / faceHeight : 0.33;
  // At rest, nose is ~0.33 of the way from eyes to chin
  const pitch = (noseRelative - 0.33) * -90; // negative = looking up

  // ── Roll (head tilt) ──
  const roll =
    Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) *
    (180 / Math.PI);

  return { yaw, pitch, roll };
}

// ── The Hook ───────────────────────────────────────────────────────────────────

/**
 * `useVideoAntiCheat` — Analyzes a video stream to detect if the user is
 * looking away from the screen or turning their head excessively.
 *
 * @param videoRef  - Ref to the HTMLVideoElement rendering the webcam feed.
 * @param enabled   - Whether detection is active (default: true).
 * @returns AntiCheatStatus object with yaw, pitch, gaze, and flag states.
 */
export function useVideoAntiCheat(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean = true,
): AntiCheatStatus {
  const [status, setStatus] = useState<AntiCheatStatus>(DEFAULT_STATUS);
  const landmarkerRef = useRef<any>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(-1);

  // ── Initialize MediaPipe FaceLandmarker ──────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;

    let cancelled = false;

    async function initLandmarker() {
      try {
        const { FaceLandmarker, FilesetResolver } =
          await import("@mediapipe/tasks-vision");

        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
        );

        const landmarker = await FaceLandmarker.createFromOptions(
          filesetResolver,
          {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFacialTransformationMatrixes: true,
            outputFaceBlendshapes: false,
          },
        );

        if (!cancelled) {
          landmarkerRef.current = landmarker;
          setStatus((prev) => ({ ...prev, isReady: true }));
        }
      } catch (error) {
        console.error(
          "[VideoAntiCheat] Failed to initialize landmarker:",
          error,
        );
      }
    }

    initLandmarker();

    return () => {
      cancelled = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, [enabled]);

  // ── Detection Loop ───────────────────────────────────────────────────────
  const detect = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (
      !video ||
      !landmarker ||
      video.readyState < 2 ||
      video.paused ||
      video.ended
    ) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    const now = performance.now();

    // MediaPipe requires strictly increasing timestamps
    if (now <= lastTimeRef.current) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }
    lastTimeRef.current = now;

    try {
      const result = landmarker.detectForVideo(video, now);

      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        const landmarks = result.faceLandmarks[0];

        // ── Head Pose ──────────────────────────────────────────────────
        let yaw = 0,
          pitch = 0,
          roll = 0;

        if (
          result.facialTransformationMatrixes &&
          result.facialTransformationMatrixes.length > 0
        ) {
          // Preferred path: use MediaPipe's precomputed transformation matrix
          const matrix = result.facialTransformationMatrixes[0];
          const angles = extractYawPitchRoll(matrix);
          yaw = angles.yaw;
          pitch = angles.pitch;
          roll = angles.roll;
        } else {
          // Fallback: geometric estimation from landmarks
          const angles = estimateHeadPoseFromLandmarks(
            landmarks,
            video.videoWidth,
            video.videoHeight,
          );
          yaw = angles.yaw;
          pitch = angles.pitch;
          roll = angles.roll;
        }

        // ── Iris / Gaze ────────────────────────────────────────────────
        let gazeX = 0.5,
          gazeY = 0.5;

        // Only compute iris ratios if we have enough landmarks (478+ = iris available)
        if (landmarks.length > 477) {
          const leftIris = computeIrisRatio(landmarks, "left");
          const rightIris = computeIrisRatio(landmarks, "right");

          // Average both eyes for a more stable reading
          gazeX = (leftIris.x + rightIris.x) / 2;
          gazeY = (leftIris.y + rightIris.y) / 2;
        }

        // ── Anti-Cheat Flags ───────────────────────────────────────────
        const isLookingAway =
          Math.abs(yaw) > YAW_THRESHOLD || Math.abs(pitch) > PITCH_THRESHOLD;

        const isGazeOffCenter =
          gazeX < GAZE_EDGE_THRESHOLD ||
          gazeX > 1 - GAZE_EDGE_THRESHOLD ||
          gazeY < GAZE_EDGE_THRESHOLD ||
          gazeY > 1 - GAZE_EDGE_THRESHOLD;

        const isFlagged = isLookingAway || isGazeOffCenter;

        setStatus({
          yaw: parseFloat(yaw.toFixed(1)),
          pitch: parseFloat(pitch.toFixed(1)),
          roll: parseFloat(roll.toFixed(1)),
          gazeX: parseFloat(gazeX.toFixed(3)),
          gazeY: parseFloat(gazeY.toFixed(3)),
          isFlagged,
          isLookingAway,
          isGazeOffCenter,
          isReady: true,
        });
      }
    } catch (error) {
      // Silently continue — transient frame errors are normal
    }

    animFrameRef.current = requestAnimationFrame(detect);
  }, [videoRef]);

  // ── Start / Stop Detection Loop ──────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !landmarkerRef.current) return;

    animFrameRef.current = requestAnimationFrame(detect);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [enabled, detect, status.isReady]);

  return status;
}

export default useVideoAntiCheat;
