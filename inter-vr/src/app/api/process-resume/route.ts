import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createAdminClient } from "@/utils/supabase/admin";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

const EXTRACTION_PROMPT = `You are a resume parsing expert. Analyze the provided PDF resume and extract structured information.

Return ONLY a valid JSON object with this exact structure (no markdown, no code fences, just raw JSON):
{
  "skills": ["skill1", "skill2"],
  "experience": [
    {
      "role": "Job Title",
      "company": "Company Name",
      "duration": "e.g. Jun 2023 - Present",
      "highlights": ["achievement1", "achievement2"]
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "tech_stack": ["React", "Node.js"],
      "description": "Brief description of what the project does"
    }
  ],
  "education": {
    "degree": "B.Tech in Computer Science",
    "institution": "University Name",
    "year": "2024",
    "gpa": "8.5/10"
  },
  "certifications": ["Cert 1", "Cert 2"],
  "summary": "A 2-3 sentence professional summary of the candidate based on their resume"
}

If a section has no data, use an empty array [] or null. Always return valid JSON.`;

export async function POST(request: NextRequest) {
    try {
        const { resumeUrl, userId } = await request.json();

        if (!resumeUrl || !userId) {
            return NextResponse.json(
                { error: "Missing resumeUrl or userId" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // 1. Mark status as processing
        await supabase
            .from("users")
            .update({ resume_processing_status: "processing" })
            .eq("id", userId);

        // 2. Download the PDF from the URL
        const pdfResponse = await fetch(resumeUrl);
        if (!pdfResponse.ok) {
            throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
        }

        const pdfBuffer = await pdfResponse.arrayBuffer();
        const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

        // 3. Send to Gemini 2.0 Flash for extraction
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const result = await model.generateContent([
            { text: EXTRACTION_PROMPT },
            {
                inlineData: {
                    mimeType: "application/pdf",
                    data: pdfBase64,
                },
            },
        ]);

        const responseText = result.response.text();

        // 4. Parse the JSON response (strip any markdown fences if present)
        let processedResume;
        try {
            const cleanJson = responseText
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim();
            processedResume = JSON.parse(cleanJson);
        } catch (parseError) {
            console.error("Failed to parse Gemini response:", responseText);
            throw new Error("Gemini returned invalid JSON");
        }

        // 5. Store the structured resume data back in the users table
        const { error: updateError } = await supabase
            .from("users")
            .update({
                processed_resume: processedResume,
                resume_processing_status: "completed",
            })
            .eq("id", userId);

        if (updateError) {
            throw new Error(`DB update failed: ${updateError.message}`);
        }

        return NextResponse.json({
            success: true,
            message: "Resume processed successfully",
        });
    } catch (error: any) {
        console.error("Resume processing error:", error);

        // Try to mark as failed if we have userId
        try {
            const { userId } = await request.clone().json();
            if (userId) {
                const supabase = createAdminClient();
                await supabase
                    .from("users")
                    .update({ resume_processing_status: "failed" })
                    .eq("id", userId);
            }
        } catch { }

        return NextResponse.json(
            { error: error.message || "Failed to process resume" },
            { status: 500 }
        );
    }
}
