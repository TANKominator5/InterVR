import { NextRequest, NextResponse } from "next/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { createAdminClient } from "@/utils/supabase/admin";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GEMINI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    // Verify user owns this session
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await request.json();

    // Verify session belongs to user
    const { data: sessionCheck } = await supabase
      .from("interview_sessions")
      .select("user_id")
      .eq("id", sessionId)
      .single();

    if (!sessionCheck || sessionCheck.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: session } = await supabase
      .from("interview_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Fetch user details
    const { data: userData } = await supabase
      .from("users")
      .select("full_name, tech_stack")
      .eq("id", session.user_id)
      .single();

    const answeredQuestions = (session.questions || []).filter(
      (q: any) => q.answer_transcript,
    );

    if (answeredQuestions.length === 0) {
      return NextResponse.json(
        { error: "No answers to generate report from" },
        { status: 400 },
      );
    }

    const questionsText = answeredQuestions
      .map(
        (q: any, i: number) => `
Q${i + 1}: ${q.question}
Answer: ${q.answer_transcript}
Scores: Accuracy ${q.grading?.accuracy_score}/10, Depth ${q.grading?.depth_score}/10, Communication ${q.grading?.communication_score}/10
Feedback: ${q.grading?.feedback}
        `,
      )
      .join("\n\n");

    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: `You are an expert hiring manager generating a final interview report.
Return ONLY valid JSON with no markdown fences.

CANDIDATE: ${userData?.full_name || "Candidate"}
ROLE APPLIED: ${userData?.tech_stack || "Software Developer"}
INTERVIEW TOPIC: ${session.topic}
DIFFICULTY: ${session.difficulty}

FULL Q&A TRANSCRIPT:
${questionsText}

Return this exact JSON:
{
  "overall_score": <0-100>,
  "summary": "<2-3 sentence performance summary>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "areas_to_improve": ["<area 1>", "<area 2>", "<area 3>"],
  "recommendation": "<Strong Hire|Hire|Maybe|No Hire>"
}`,
    });

    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const reportData = JSON.parse(cleaned);

    const breakdown = answeredQuestions.map((q: any) => ({
      question: q.question,
      answer_transcript: q.answer_transcript,
      score: q.grading
        ? {
          accuracy: q.grading.accuracy_score,
          depth: q.grading.depth_score,
          communication: q.grading.communication_score,
        }
        : null,
      feedback: q.grading?.feedback,
      code_submission: q.code_submission || null,
      code_language: q.code_language || null,
      code_analysis: q.code_analysis ? {
        verdict: q.code_analysis.verdict,
        time_complexity: q.code_analysis.time_complexity,
        space_complexity: q.code_analysis.space_complexity,
        correctness_score: q.code_analysis.correctness_score,
        quality_score: q.code_analysis.quality_score,
        overall_feedback: q.code_analysis.overall_feedback,
      } : null,
    }));

    const durationMinutes = session.completed_at
      ? Math.round(
        (new Date(session.completed_at).getTime() -
          new Date(session.created_at).getTime()) /
        60000,
      )
      : 0;

    const { data: report, error: reportError } = await supabase
      .from("interview_reports")
      .insert({
        session_id: sessionId,
        user_id: session.user_id,
        overall_score: reportData.overall_score,
        duration_minutes: durationMinutes,
        questions_answered: answeredQuestions.length,
        breakdown,
        summary: reportData.summary,
        strengths: reportData.strengths,
        areas_to_improve: reportData.areas_to_improve,
      })
      .select()
      .single();

    if (reportError) throw new Error(reportError.message);

    await supabase
      .from("interview_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", sessionId);

    return NextResponse.json({
      reportId: report.id,
      report: { ...reportData, breakdown },
    });
  } catch (error: any) {
    console.error("Report generation error:", error);
    return NextResponse.json(
      { error: error.message || "Report generation failed" },
      { status: 500 },
    );
  }
}
