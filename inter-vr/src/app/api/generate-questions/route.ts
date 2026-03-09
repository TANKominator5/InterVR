import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GEMINI_API_KEY,
});
const NIM_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

function buildPrompt(
  userContext: any,
  session: any,
  questionCount: number,
): string {
  return `You are an expert technical interviewer. Generate exactly ${questionCount} interview questions.

CANDIDATE CONTEXT:
- Name: ${userContext.full_name || "Candidate"}
- Institution: ${userContext.institution_name || "Not specified"}
- Year of Study: ${userContext.year_of_study || "Not specified"}
- CGPA: ${userContext.cgpa || "Not specified"}
- Target Role: ${userContext.tech_stack || "Software Developer"}

RESUME HIGHLIGHTS:
${userContext.processed_resume ? JSON.stringify(userContext.processed_resume, null, 2) : "No resume data available"}

INTERVIEW CONFIGURATION:
- Topic: ${session.topic}
- Difficulty: ${session.difficulty}
- Tone: ${session.tone} (be ${session.tone.toLowerCase()} in your questioning style)

INSTRUCTIONS:
- Questions should be progressively harder
- Tailor questions based on the candidate's resume, projects, and experience level
- Include a mix of conceptual, practical, and scenario-based questions
- For coding topics, include at least 1-2 code-related questions
- If the candidate's resume mentions relevant projects, ask about them
- Generate exactly ${questionCount} questions

Return ONLY a valid JSON object: {"questions": [...]}
Each question must have: id (number), question (string), category (conceptual|practical|scenario|coding), difficulty (easy|medium|hard), expected_answer_outline (string), follow_up_hint (string)`;
}

// Try NIM API with a 15-second timeout
async function tryNIM(prompt: string): Promise<any[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(NIM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NVIDIA_NIM_API_KEY}`,
      },
      body: JSON.stringify({
        model: "nvidia/llama-3.3-nemotron-super-49b-v1",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`NIM returned ${res.status}, falling back to Groq`);
      return null;
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const cleaned = raw
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return parsed.questions || parsed;
  } catch (err: any) {
    clearTimeout(timeout);
    console.warn(
      "NIM failed/timed out:",
      err.name === "AbortError" ? "15s timeout" : err.message,
    );
    return null;
  }
}

// Fallback: Gemini via Vercel AI SDK
async function useGeminiFallback(prompt: string): Promise<any[]> {
  console.log("Using Gemini fallback for question generation...");
  const { text } = await generateText({
    model: google("gemini-2.5-flash"),
    prompt,
  });
  const cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  return parsed.questions || parsed;
}

export async function POST(request: NextRequest) {
  try {
    // Verify user owns this session
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAuth = createAdminClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    // Verify session belongs to user
    const { data: sessionCheck } = await supabaseAuth
      .from("interview_sessions")
      .select("user_id")
      .eq("id", sessionId)
      .single();

    if (!sessionCheck || sessionCheck.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabaseAdmin = createAdminClient();

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("interview_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { data: userContext, error: userError } = await supabaseAdmin
      .from("users")
      .select(
        "full_name, institution_name, year_of_study, cgpa, tech_stack, processed_resume",
      )
      .eq("id", session.user_id)
      .single();

    if (userError || !userContext) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    await supabaseAdmin
      .from("interview_sessions")
      .update({ status: "generating" })
      .eq("id", sessionId);

    const questionCount =
      session.duration === "Short (15m)"
        ? 5
        : session.duration === "Medium (30m)"
          ? 10
          : 15;

    const prompt = buildPrompt(userContext, session, questionCount);

    // Try NIM first (15s timeout), fall back to Gemini
    let questions = await tryNIM(prompt);
    const source = questions ? "nemotron" : "gemini";

    if (!questions) {
      questions = await useGeminiFallback(prompt);
    }

    const { error: updateError } = await supabaseAdmin
      .from("interview_sessions")
      .update({ questions, status: "ready" })
      .eq("id", sessionId);

    if (updateError) throw new Error(`Failed to save: ${updateError.message}`);

    console.log(
      `Questions generated via ${source} (${questions.length} questions)`,
    );

    return NextResponse.json({
      success: true,
      sessionId,
      questionCount: questions.length,
      source,
    });
  } catch (error: any) {
    console.error("Question generation error:", error);
    try {
      const body = await request.clone().json();
      if (body.sessionId) {
        const supabase = createAdminClient();
        await supabase
          .from("interview_sessions")
          .update({ status: "failed" })
          .eq("id", body.sessionId);
      }
    } catch { }
    return NextResponse.json(
      { error: error.message || "Failed to generate questions" },
      { status: 500 },
    );
  }
}
