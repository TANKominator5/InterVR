import assert from "node:assert/strict";
import { test } from "node:test";
import { generateText } from "ai";

test("interview tasks generate through their assigned Gemma 4 Google endpoints", async (t) => {
  const previousKey = process.env.GOOGLE_GEMINI_API_KEY;
  process.env.GOOGLE_GEMINI_API_KEY = "test-google-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.GOOGLE_GEMINI_API_KEY;
    else process.env.GOOGLE_GEMINI_API_KEY = previousKey;
  });
  const { getInterviewGenerationOptions } = await import("./models");
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get("x-goog-api-key"), "test-google-key");
    requests.push({ url: String(url), body: JSON.parse(options.body as string) });
    return Response.json({
      candidates: [{ content: { role: "model", parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 5, totalTokenCount: 13 },
    });
  });

  const assignments = {
    questions: "gemma-4-26b-a4b-it",
    grading: "gemma-4-26b-a4b-it",
    codeAnalysis: "gemma-4-31b-it",
    report: "gemma-4-26b-a4b-it",
  } as const;
  for (const task of Object.keys(assignments) as (keyof typeof assignments)[]) {
    const result = await generateText({ ...getInterviewGenerationOptions(task), prompt: "Return JSON only.", maxRetries: 0 });
    assert.deepEqual(JSON.parse(result.text), { ok: true });
    const request = requests[requests.length - 1];
    assert.equal(new URL(request.url).hostname, "generativelanguage.googleapis.com");
    assert.ok(new URL(request.url).pathname.endsWith(`/models/${assignments[task]}:generateContent`));
    assert.deepEqual((request.body.generationConfig as Record<string, unknown>).thinkingConfig, { thinkingLevel: "minimal" });
  }
  assert.equal(requests.length, 4);
});

test("a Gemma quota error is surfaced without switching to Gemini or Groq", async (t) => {
  const { getInterviewGenerationOptions } = await import("./models");
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    requests.push(String(url));
    return Response.json({ error: { code: 429, message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
  });
  await assert.rejects(generateText({ ...getInterviewGenerationOptions("grading"), prompt: "Grade this answer.", maxRetries: 0 }), /Quota exceeded/);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].includes("gemma-4-26b-a4b-it:generateContent"));
});
