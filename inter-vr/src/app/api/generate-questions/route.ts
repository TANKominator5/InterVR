import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

const NIM_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

function buildSystemPrompt(userContext: any, config: any): string {
    const questionCount = config.duration === "Short (15m)" ? 5
        : config.duration === "Medium (30m)" ? 10
            : 15;

    return `You are an expert technical interviewer conducting a ${config.difficulty} level interview.

CANDIDATE CONTEXT:
- Name: ${userContext.full_name || "Candidate"}
- Institution: ${userContext.institution_name || "Not specified"}
- Year of Study: ${userContext.year_of_study || "Not specified"}  
- CGPA: ${userContext.cgpa || "Not specified"}
- Target Role: ${userContext.tech_stack || "Software Developer"}

RESUME HIGHLIGHTS:
${userContext.processed_resume ? JSON.stringify(userContext.processed_resume, null, 2) : "No resume data available"}

INTERVIEW CONFIGURATION:
- Topic: ${config.topic}
- Difficulty: ${config.difficulty}
- Tone: ${config.tone} (be ${config.tone.toLowerCase()} in your questioning style)
- Number of questions: ${questionCount}

INSTRUCTIONS:
Generate exactly ${questionCount} interview questions for the topic "${config.topic}".
- Questions should be progressively harder
- Tailor questions based on the candidate's resume, projects, and experience level
- Include a mix of conceptual, practical, and scenario-based questions
- For coding topics, include at least 1-2 code-related questions
- If the candidate's resume mentions relevant projects, ask about them

Return ONLY a valid JSON array (no markdown, no code fences, just raw JSON):
[
  {
    "id": 1,
    "question": "The question text",
    "category": "conceptual|practical|scenario|coding",
    "difficulty": "easy|medium|hard",
    "expected_answer_outline": "Key points the answer should cover",
    "follow_up_hint": "A potential follow-up if the answer is vague"
  }
]`;
}

export async function POST(request: NextRequest) {
    try {
        const { sessionId } = await request.json();

        if (!sessionId) {
            return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
        }

        const supabaseAdmin = createAdminClient();

        // 1. Fetch the session details
        const { data: session, error: sessionError } = await supabaseAdmin
            .from("interview_sessions")
            .select("*")
            .eq("id", sessionId)
            .single();

        if (sessionError || !session) {
            return NextResponse.json({ error: "Session not found" }, { status: 404 });
        }

        // 2. Fetch user context (profile + processed resume)
        const { data: userContext, error: userError } = await supabaseAdmin
            .from("users")
            .select("full_name, institution_name, year_of_study, cgpa, tech_stack, processed_resume")
            .eq("id", session.user_id)
            .single();

        if (userError || !userContext) {
            return NextResponse.json({ error: "User profile not found" }, { status: 404 });
        }

        // 3. Update session status to generating
        await supabaseAdmin
            .from("interview_sessions")
            .update({ status: "generating" })
            .eq("id", sessionId);

        // 4. Call NVIDIA NIM API (Nemotron Ultra)
        const systemPrompt = buildSystemPrompt(userContext, {
            topic: session.topic,
            difficulty: session.difficulty,
            duration: session.duration,
            tone: session.tone,
        });

        const nimResponse = await fetch(NIM_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.NVIDIA_NIM_API_KEY}`,
            },
            body: JSON.stringify({
                model: "nvidia/llama-3.3-nemotron-super-49b-v1",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "Generate the interview questions now." },
                ],
                temperature: 0.7,
                max_tokens: 4096,
            }),
        });

        if (!nimResponse.ok) {
            const errBody = await nimResponse.text();
            console.error("NIM API error:", nimResponse.status, errBody);
            throw new Error(`NIM API failed: ${nimResponse.status}`);
        }

        const nimData = await nimResponse.json();
        const rawContent = nimData.choices?.[0]?.message?.content || "";

        // 5. Parse questions JSON
        let questions;
        try {
            const cleanJson = rawContent
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim();
            questions = JSON.parse(cleanJson);
        } catch (parseError) {
            console.error("Failed to parse NIM response:", rawContent);
            throw new Error("Failed to parse generated questions");
        }

        // 6. Save questions to session and mark as ready
        const { error: updateError } = await supabaseAdmin
            .from("interview_sessions")
            .update({
                questions: questions,
                status: "ready",
            })
            .eq("id", sessionId);

        if (updateError) {
            throw new Error(`Failed to save questions: ${updateError.message}`);
        }

        return NextResponse.json({
            success: true,
            sessionId,
            questionCount: questions.length,
        });

    } catch (error: any) {
        console.error("Question generation error:", error);

        // Try to mark session as failed
        try {
            const { sessionId } = await request.clone().json();
            if (sessionId) {
                const supabase = createAdminClient();
                await supabase
                    .from("interview_sessions")
                    .update({ status: "failed" })
                    .eq("id", sessionId);
            }
        } catch { }

        return NextResponse.json(
            { error: error.message || "Failed to generate questions" },
            { status: 500 }
        );
    }
}
