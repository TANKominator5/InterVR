import { NextRequest, NextResponse } from "next/server";
import Meyda from "meyda";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const arrayBuffer = await req.arrayBuffer();
    const alignedBuffer = arrayBuffer.slice(
      0,
      arrayBuffer.byteLength - (arrayBuffer.byteLength % 4),
    );
    const audioData = new Float32Array(alignedBuffer);

    if (audioData.length < 2048) {
      return NextResponse.json(
        { error: "Buffer too small. Need at least 2048 samples." },
        { status: 400 },
      );
    }

    // ── Extract per-frame features ───────────────────────────────────────
    const frameSize = 2048;
    const hopSize = 1024;
    Meyda.bufferSize = frameSize;
    // Assume 48kHz sample rate (WebAudio default). Each hop = hopSize/sampleRate seconds.
    const sampleRate = 48000;
    const frameDuration = hopSize / sampleRate; // ~0.0213s per hop

    const rmsValues: number[] = [];

    for (
      let offset = 0;
      offset + frameSize <= audioData.length;
      offset += hopSize
    ) {
      const frame = audioData.slice(offset, offset + frameSize);
      const features = Meyda.extract(["rms"], frame);
      if (!features) continue;
      const rms = features.rms as number;
      if (!isNaN(rms)) rmsValues.push(rms);
    }

    if (rmsValues.length < 10) {
      return NextResponse.json({
        confidenceScore: 0,
        details: { error: "Not enough audio data" },
      });
    }

    const totalFrames = rmsValues.length;
    const totalDuration = totalFrames * frameDuration;

    // ── Classify frames as speech or silence ─────────────────────────────
    // Adaptive threshold: use the 15th percentile of RMS as a noise floor,
    // then set threshold slightly above it.
    const sorted = [...rmsValues].sort((a, b) => a - b);
    const noiseFloor = sorted[Math.floor(sorted.length * 0.15)];
    const silenceThreshold = Math.max(0.003, noiseFloor * 2.5);

    const isSpeech = rmsValues.map((r) => r >= silenceThreshold);
    const speechRms = rmsValues.filter((_, i) => isSpeech[i]);
    const speechFrameCount = speechRms.length;

    if (speechFrameCount < 5) {
      return NextResponse.json({
        confidenceScore: 0.05,
        details: { error: "Almost no speech detected", silenceThreshold },
      });
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const stdDev = (arr: number[]) => {
      const m = avg(arr);
      return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
    };

    // ═══════════════════════════════════════════════════════════════════════
    // Factor 1: SPEECH RATIO (0–1) — 30% weight
    // What % of the recording is actual speech vs. silence/pauses?
    // Confident speakers fill >80% with speech. Hesitant speakers <50%.
    // ═══════════════════════════════════════════════════════════════════════
    const speechRatio = speechFrameCount / totalFrames;
    // Map: 0.4 → 0.0, 0.9 → 1.0
    const speechRatioScore = Math.max(
      0,
      Math.min(1, (speechRatio - 0.4) / 0.5),
    );

    // ═══════════════════════════════════════════════════════════════════════
    // Factor 2: PAUSE PATTERN (0–1) — 25% weight
    // Count distinct pauses (silence runs) and their average length.
    // Confident: few short pauses. Hesitant: many/long pauses.
    // ═══════════════════════════════════════════════════════════════════════
    const allGaps: number[] = [];
    let currentPauseLen = 0;
    for (let i = 0; i < totalFrames; i++) {
      if (!isSpeech[i]) {
        currentPauseLen++;
      } else if (currentPauseLen > 0) {
        allGaps.push(currentPauseLen * frameDuration); // in seconds
        currentPauseLen = 0;
      }
    }
    if (currentPauseLen > 0) {
      allGaps.push(currentPauseLen * frameDuration);
    }

    // Only count gaps >= 150ms as deliberate pauses (ignore natural breath gaps)
    const pauseLengths = allGaps.filter((g) => g >= 0.15);

    // Pauses per second of speech
    const speechDuration = speechFrameCount * frameDuration;
    const pausesPerSec =
      speechDuration > 0 ? pauseLengths.length / speechDuration : 0;
    // Average pause duration (of real pauses only)
    const avgPauseDur = pauseLengths.length > 0 ? avg(pauseLengths) : 0;
    // Long pauses (>0.7s) — these are hesitation pauses
    const longPauses = pauseLengths.filter((p) => p > 0.7).length;

    // Score: penalize frequent pauses, long avg pause, many long pauses
    let pauseScore = 1.0;
    pauseScore -= Math.min(0.35, pausesPerSec * 0.12); // frequent pauses
    pauseScore -= Math.min(0.3, avgPauseDur * 0.35); // long avg pause
    pauseScore -= Math.min(0.3, longPauses * 0.08); // many hesitations
    pauseScore = Math.max(0, Math.min(1, pauseScore));

    // ═══════════════════════════════════════════════════════════════════════
    // Factor 3: VOCAL ENERGY (0–1) — 20% weight
    // How loud is the speech (only measuring voiced frames, not silence).
    // ═══════════════════════════════════════════════════════════════════════
    const avgSpeechRms = avg(speechRms);
    // Map: mumbling ~0.01 → low, confident ~0.04+ → high
    const energyScore = Math.min(1, Math.sqrt(avgSpeechRms / 0.04));

    // ═══════════════════════════════════════════════════════════════════════
    // Factor 4: ENERGY SUSTAIN (0–1) — 15% weight
    // Does the speaker maintain energy throughout, or trail off?
    // Compare average RMS of speech frames in the first half vs. second half.
    // ═══════════════════════════════════════════════════════════════════════
    const midpoint = Math.floor(speechRms.length / 2);
    const firstHalfRms = avg(speechRms.slice(0, midpoint));
    const secondHalfRms = avg(speechRms.slice(midpoint));
    // Ratio close to 1.0 = sustained. Below 0.5 = trailing off badly.
    const sustainRatio =
      firstHalfRms > 0 ? Math.min(secondHalfRms / firstHalfRms, 1.5) : 0;
    // Map: 0.4 → 0.0, 1.0+ → 1.0
    const sustainScore = Math.max(0, Math.min(1, (sustainRatio - 0.4) / 0.6));

    // ═══════════════════════════════════════════════════════════════════════
    // Factor 5: FLUENCY (0–1) — 10% weight
    // Smooth, continuous speech vs. choppy start-stop pattern.
    // Measure the coefficient of variation of speech-frame RMS.
    // Low CoV = smooth and steady. High CoV = choppy/erratic.
    // ═══════════════════════════════════════════════════════════════════════
    const speechRmsStd = stdDev(speechRms);
    const speechCoV = avgSpeechRms > 0 ? speechRmsStd / avgSpeechRms : 2;
    // Good speech CoV: 0.3-0.6, poor: >1.0
    const fluencyScore = Math.max(0, Math.min(1, 1 - (speechCoV - 0.3) / 1.0));

    // ═══════════════════════════════════════════════════════════════════════
    // Weighted combination
    // ═══════════════════════════════════════════════════════════════════════
    const weights = {
      speechRatio: 0.3,
      pausePattern: 0.25,
      energy: 0.2,
      sustain: 0.15,
      fluency: 0.1,
    };

    const confidence =
      speechRatioScore * weights.speechRatio +
      pauseScore * weights.pausePattern +
      energyScore * weights.energy +
      sustainScore * weights.sustain +
      fluencyScore * weights.fluency;

    const finalScore = Math.max(0, Math.min(1, confidence));

    return NextResponse.json({
      confidenceScore: parseFloat(finalScore.toFixed(4)),
      details: {
        speechRatio: parseFloat(speechRatioScore.toFixed(4)),
        pausePattern: parseFloat(pauseScore.toFixed(4)),
        energy: parseFloat(energyScore.toFixed(4)),
        sustain: parseFloat(sustainScore.toFixed(4)),
        fluency: parseFloat(fluencyScore.toFixed(4)),
        raw: {
          speechPercent: parseFloat((speechRatio * 100).toFixed(1)),
          avgSpeechRms: parseFloat(avgSpeechRms.toFixed(6)),
          pauseCount: pauseLengths.length,
          avgPauseDuration: parseFloat(avgPauseDur.toFixed(3)),
          longPauses,
          sustainRatio: parseFloat(sustainRatio.toFixed(3)),
          totalDuration: parseFloat(totalDuration.toFixed(2)),
          framesAnalyzed: totalFrames,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Processing failed", details: error.message },
      { status: 500 },
    );
  }
}
