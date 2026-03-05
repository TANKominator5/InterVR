import { NextRequest, NextResponse } from "next/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { createAdminClient } from "@/utils/supabase/admin";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GEMINI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { sessionId, questionIndex, question, answer, userContext } =
      await request.json();

    if (!question || !answer) {
      return NextResponse.json(
        { error: "Missing question or answer" },
        { status: 400 },
      );
    }

    const prompt = `You are an expert technical interviewer grading a candidate's answer.
Return ONLY valid JSON with no markdown fences.

CANDIDATE CONTEXT:
- Institution: ${userContext?.institution_name || "Not specified"}
- Year of Study: ${userContext?.year_of_study || "Not specified"}
- Target Role: ${userContext?.tech_stack || "Software Developer"}
${userContext?.processed_resume?.skills ? `- Key Skills from Resume: ${userContext.processed_resume.skills.slice(0, 10).join(", ")}` : ""}

QUESTION ASKED: "${question.question}"
EXPECTED ANSWER OUTLINE: ${question.expected_answer_outline}
QUESTION DIFFICULTY: ${question.difficulty}
QUESTION CATEGORY: ${question.category}

CANDIDATE'S ANSWER: "${answer}"

Grade this answer fairly, considering the candidate's experience level (${userContext?.year_of_study || "student"}).
Be constructive and specific in your feedback.
Only request a follow-up if the answer was significantly incomplete or vague.

Return this exact JSON structure:
{
  "accuracy_score": <0-10>,
  "depth_score": <0-10>,
  "communication_score": <0-10>,
  "confidence_score": <0-10>,
  "overall_score": <0-10>,
  "feedback": "<specific constructive feedback>",
  "needs_followup": <true/false>,
  "followup_question": "<follow-up question if needs_followup is true, otherwise empty string>",
  "is_complete": <true/false>
}`;

    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt,
    });

    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const grading = JSON.parse(cleaned);

    // Persist grading to Supabase
    if (sessionId !== undefined && questionIndex !== undefined) {
      const supabase = createAdminClient();
      const { data: session } = await supabase
        .from("interview_sessions")
        .select("questions")
        .eq("id", sessionId)
        .single();

      if (session?.questions) {
        const updatedQuestions = [...session.questions];
        if (updatedQuestions[questionIndex]) {
          updatedQuestions[questionIndex] = {
            ...updatedQuestions[questionIndex],
            answer_transcript: answer,
            grading,
          };
          await supabase
            .from("interview_sessions")
            .update({ questions: updatedQuestions })
            .eq("id", sessionId);
        }
      }
    }

    return NextResponse.json({ grading });
  } catch (error: any) {
    console.error("Grading error:", error);
    return NextResponse.json(
      { error: error.message || "Grading failed" },
      { status: 500 },
    );
  }
}
