import assert from "node:assert/strict";
import { test } from "node:test";
import { transcribeAudio } from "./transcription";

const audio = () => new File([new Uint8Array([1, 2, 3])], "answer.webm", { type: "audio/webm" });

test("short completed jobs return immediately and select the lower-latency model", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls.push(url);
    assert.ok(options.signal);
    if (url.endsWith("upload")) return Response.json({ upload_url: "https://audio.example/answer" });
    assert.deepEqual(JSON.parse(options.body as string).speech_models, ["universal-2"]);
    return Response.json({ id: "job-1", status: "completed", text: "  Validate the input.  " });
  });
  assert.equal(await transcribeAudio(audio(), "test-key", new AbortController().signal), "Validate the input.");
  assert.equal(calls.length, 2);
});

test("provider errors and empty transcripts are not mistaken for timed-out jobs", async (t) => {
  let result: object = { id: "job-1", status: "error", error: "Invalid audio format" };
  t.mock.method(globalThis, "fetch", async (url: string) => Response.json(url.endsWith("upload") ? { upload_url: "https://audio.example/answer" } : result));
  await assert.rejects(transcribeAudio(audio(), "test-key", new AbortController().signal), /Invalid audio format/);
  result = { id: "job-2", status: "completed", text: null };
  assert.equal(await transcribeAudio(audio(), "test-key", new AbortController().signal), "");
});

test("failed polling responses surface a recoverable error instead of waiting a minute", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("upload")) return Response.json({ upload_url: "https://audio.example/answer" });
    if (url.endsWith("/transcript")) return Response.json({ id: "job-1", status: "queued" });
    return Response.json({ error: "Rate limit" }, { status: 429 });
  });
  await assert.rejects(transcribeAudio(audio(), "test-key", new AbortController().signal), /status check failed \(429\)/);
});

test("cancellation aborts queued transcription and its polling delay", async (t) => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls++;
    if (url.endsWith("upload")) return Response.json({ upload_url: "https://audio.example/answer" });
    setTimeout(() => controller.abort(), 10);
    return Response.json({ id: "job-1", status: "queued" });
  });
  await assert.rejects(transcribeAudio(audio(), "test-key", controller.signal), { name: "AbortError" });
  assert.equal(calls, 2);
});
