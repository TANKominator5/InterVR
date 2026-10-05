import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { GET, POST } from "../../app/api/interview/tts/route";

function request(text: unknown, interviewer?: unknown) {
  return new NextRequest("http://localhost/api/interview/tts", { method: "POST", body: JSON.stringify({ text, interviewer }), headers: { "Content-Type": "application/json" } });
}

test("missing voice configuration is explicit and does not send an invalid upstream request", async (t) => {
  const previous = process.env.UNREAL_SPEECH_API_KEY;
  delete process.env.UNREAL_SPEECH_API_KEY;
  t.after(() => { if (previous === undefined) delete process.env.UNREAL_SPEECH_API_KEY; else process.env.UNREAL_SPEECH_API_KEY = previous; });
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Must not fetch without a key"); });
  assert.equal((await (await GET()).json()).configured, false);
  assert.equal((await POST(request("Welcome."))).status, 503);
  assert.equal(fetch.mock.callCount(), 0);
});

test("dedicated TTS uses a v8 voice and forwards the audio stream", async (t) => {
  const previous = process.env.UNREAL_SPEECH_API_KEY;
  process.env.UNREAL_SPEECH_API_KEY = "test-key";
  t.after(() => { if (previous === undefined) delete process.env.UNREAL_SPEECH_API_KEY; else process.env.UNREAL_SPEECH_API_KEY = previous; });
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://api.v8.unrealspeech.com/stream");
    assert.equal(JSON.parse(options.body as string).VoiceId, "am_michael");
    return new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } });
  });
  const response = await POST(request("Welcome."));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Speech-Provider"), "unrealspeech");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([73, 68, 51]));
});

test("invalid or over-limit TTS text is rejected before invoking the provider", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Must not fetch invalid text"); });
  for (const text of ["", 5, "x".repeat(1001)]) assert.equal((await POST(request(text))).status, 400);
  assert.equal(fetch.mock.callCount(), 0);
});

test("each interviewer uses the matching dedicated voice", async (t) => {
  const previous = process.env.UNREAL_SPEECH_API_KEY;
  process.env.UNREAL_SPEECH_API_KEY = "test-key";
  t.after(() => { if (previous === undefined) delete process.env.UNREAL_SPEECH_API_KEY; else process.env.UNREAL_SPEECH_API_KEY = previous; });
  const sent: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    sent.push(JSON.parse(options.body as string).VoiceId);
    return new Response(new Uint8Array([73, 68, 51]));
  });
  assert.equal((await POST(request("Welcome.", "male"))).status, 200);
  assert.equal((await POST(request("Welcome.", "female"))).status, 200);
  assert.deepEqual(sent, ["am_michael", "af_bella"]);
});

test("an unknown interviewer is rejected before invoking the voice provider", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Must not fetch invalid interviewer"); });
  for (const interviewer of ["unknown", null, 5, {}]) {
    assert.equal((await POST(request("Welcome.", interviewer))).status, 400);
  }
  assert.equal(fetch.mock.callCount(), 0);
});
