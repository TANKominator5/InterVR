interface AssemblyTranscript { id?: string; status?: string; text?: string | null; error?: string }

async function readResponse<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) throw new Error(`${operation} failed (${response.status}). Please retry transcription.`);
  return response.json() as Promise<T>;
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function transcribeAudio(audio: File, apiKey: string, signal: AbortSignal): Promise<string> {
  const headers = { Authorization: apiKey };
  const upload = await readResponse<{ upload_url: string }>(await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: audio, signal,
  }), "Audio upload");
  if (!upload.upload_url) throw new Error("The transcription service did not accept the recording.");

  let result = await readResponse<AssemblyTranscript>(await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    // Universal-2 is the low-latency prerecorded model. Avoid paying the
    // Universal-3 Pro processing cost for every short interview answer.
    body: JSON.stringify({ audio_url: upload.upload_url, speech_models: ["universal-2"], language_code: "en", punctuate: true, format_text: true }),
    signal,
  }), "Transcription request");
  if (!result.id) throw new Error("The transcription service returned no job ID.");
  const id = result.id;

  while (true) {
    signal.throwIfAborted();
    if (result.status === "completed") return result.text?.trim() ?? "";
    if (result.status === "error") throw new Error(result.error || "The transcription service could not process this recording.");
    if (result.status !== "queued" && result.status !== "processing") throw new Error("The transcription service returned an invalid job status.");
    // Poll soon after submission; do not incur a mandatory one-second delay
    // when a short recording has already finished. All work shares a deadline.
    await wait(result.status === "queued" ? 500 : 750, signal);
    result = await readResponse<AssemblyTranscript>(await fetch(`https://api.assemblyai.com/v2/transcript/${encodeURIComponent(id)}`, {
      headers, signal, cache: "no-store",
    }), "Transcription status check");
  }
}
