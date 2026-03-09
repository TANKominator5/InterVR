import { NextRequest, NextResponse } from "next/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { createAdminClient } from "@/utils/supabase/admin";

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GEMINI_API_KEY,
});

interface UserContext {
    year_of_study?: string;
    tech_stack?: string;
    full_name?: string;
    institution_name?: string;
}

export async function POST(request: NextRequest) {
    try {
        // ── Auth Check ────────────────────────────────────────────────────────
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.replace("Bearer ", "");
        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const supabase = createAdminClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const {
            sessionId,
            questionIndex,
            question,
            code,
            language,
            userContext,
            expectedAnswerOutline,
        } = (await request.json()) as {
            sessionId: string;
            questionIndex: number;
            question: string;
            code: string;
            language: string;
            userContext: UserContext;
            expectedAnswerOutline: string;
        };

        // ── Verify session ownership ──────────────────────────────────────────
        const { data: sessionCheck } = await supabase
            .from("interview_sessions")
            .select("user_id")
            .eq("id", sessionId)
            .single();

        if (!sessionCheck || sessionCheck.user_id !== user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (!code || !question) {
            return NextResponse.json(
                { error: "Missing code or question" },
                { status: 400 }
            );
        }

        // ── AI Analysis ───────────────────────────────────────────────────────
        const prompt = `You are an expert code reviewer conducting a technical interview.
Analyze the candidate's code submission and return ONLY valid JSON.
No markdown. No explanation outside JSON.

INTERVIEW QUESTION: "${question}"
EXPECTED APPROACH: ${expectedAnswerOutline || "Not specified"}
CANDIDATE LEVEL: ${userContext?.year_of_study || "student"}
TARGET ROLE: ${userContext?.tech_stack || "Software Developer"}

SUBMITTED CODE (${language}):
\`\`\`${language}
${code}
\`\`\`

Analyze this code and return this EXACT JSON:
{
  "verdict": "pass" | "partial" | "fail",
  "time_complexity": "<Big O notation>",
  "space_complexity": "<Big O notation>",
  "correctness_score": <0-10>,
  "quality_score": <0-10>,
  "line_feedback": [
    { "line": <number>, "comment": "<specific comment>", "severity": "info" | "warning" | "error" }
  ],
  "overall_feedback": "<2-3 sentence paragraph>",
  "has_counter_question": <true/false>,
  "counter_question": "<deep follow-up question about their approach, e.g. how to optimize, edge cases, or explain a specific line — leave empty string if has_counter_question is false>",
  "suggested_fix": "<one short hint to improve, NOT a full solution>"
}

Rules:
- Only set has_counter_question to true if the answer is partial or has an interesting optimization opportunity worth probing
- line_feedback should have max 4 entries, focus on most important lines
- suggested_fix must NOT reveal the full correct algorithm
- Be fair for the candidate's level (${userContext?.year_of_study || "student"})`;

        const { text } = await generateText({
            model: google("gemini-2.5-flash"),
            prompt,
        });

        const cleaned = text
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();
        const analysis = JSON.parse(cleaned);

        // ── Persist to Supabase ───────────────────────────────────────────────
        if (sessionId !== undefined && questionIndex !== undefined) {
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
                        code_submission: code,
                        code_language: language,
                        code_analysis: analysis,
                    };
                    await supabase
                        .from("interview_sessions")
                        .update({ questions: updatedQuestions })
                        .eq("id", sessionId);
                }
            }
        }

        return NextResponse.json({ analysis });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Code analysis failed";
        console.error("Code analysis error:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
