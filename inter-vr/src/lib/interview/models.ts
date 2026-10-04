import { createGoogleGenerativeAI } from "@ai-sdk/google";

// These two Gemma 4 variants are exposed by the Gemini API. Keep task routing
// in one place so changing an interview model does not affect resume or audio.
export const INTERVIEW_MODELS = {
  // The 26B MoE model favors throughput for question generation and summaries.
  questions: "gemma-4-26b-a4b-it",
  report: "gemma-4-26b-a4b-it",
  // Live scoring must fit the existing 30-second grading deadline.
  grading: "gemma-4-26b-a4b-it",
  // Code review favors the dense model's detailed reasoning over throughput.
  codeAnalysis: "gemma-4-31b-it",
} as const;

export type InterviewModelTask = keyof typeof INTERVIEW_MODELS;

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GEMINI_API_KEY,
});

export function getInterviewGenerationOptions(task: InterviewModelTask) {
  return {
    model: google(INTERVIEW_MODELS[task]),
    // Gemma 4 accepts thinkingLevel, but rejects Gemini 2.5's thinkingBudget.
    // Minimal reasoning keeps structured interview responses interactive.
    providerOptions: {
      google: { thinkingConfig: { thinkingLevel: "minimal" as const } },
    },
  };
}
