import { wordsToTimedVisemes } from "./viseme-map";

export function estimateWordTimings(text: string, durationMs?: number) {
  let cursor = 0;
  const words = [...text.matchAll(/\S+/g)].map((match) => {
    const word = match[0];
    const syllables = Math.max(1, word.match(/[aeiouy]+/gi)?.length ?? 1);
    const pause = /[.!?]$/.test(word) ? 240 : /[,;:]$/.test(word) ? 120 : 0;
    const length = (150 + syllables * 110) / 0.95 + pause;
    const timing = { word, charIndex: match.index, startMs: cursor, durationMs: length };
    cursor += length;
    return timing;
  });
  const scale = durationMs !== undefined && cursor > 0 ? Math.max(1, durationMs) / cursor : 1;
  return words.map((word) => ({ ...word, startMs: word.startMs * scale, durationMs: word.durationMs * scale }));
}

export function approximateSpeechCues(text: string, durationMs: number) {
  return wordsToTimedVisemes(estimateWordTimings(text, durationMs));
}

// Unreal Speech /stream accepts at most 1000 characters. Prefer sentence/word
// boundaries, but also support a single long token without dropping any text.
export function splitSpeechText(text: string, limit = 1000): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    const segment = remaining.slice(0, limit + 1);
    const sentenceEnds = [...segment.matchAll(/[.!?]\s/g)];
    const lastSentence = sentenceEnds[sentenceEnds.length - 1];
    const sentenceEnd = lastSentence ? lastSentence.index + 1 : -1;
    const wordEnd = segment.lastIndexOf(" ", limit);
    const end = sentenceEnd >= limit * 0.4 ? sentenceEnd : wordEnd > 0 ? wordEnd : limit;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
