export interface GradingResult {
  accuracy_score: number;
  depth_score: number;
  communication_score: number;
  confidence_score?: number;
  overall_score: number;
  feedback: string;
  needs_followup: boolean;
  followup_question?: string;
  is_complete: boolean;
}

export function parseGradingResult(value: unknown): GradingResult {
  if (!value || typeof value !== "object") throw new Error("The grading service returned no feedback. Please retry.");
  const result = value as Record<string, unknown>;
  for (const key of ["accuracy_score", "depth_score", "communication_score", "overall_score"]) {
    const score = result[key];
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 10) {
      throw new Error("The grading service returned invalid scores. Please retry.");
    }
  }
  if (typeof result.feedback !== "string" || !result.feedback.trim() ||
    typeof result.needs_followup !== "boolean" || typeof result.is_complete !== "boolean" ||
    (result.needs_followup && (typeof result.followup_question !== "string" || !result.followup_question.trim()))) {
    throw new Error("The grading service returned incomplete feedback. Please retry.");
  }
  return result as unknown as GradingResult;
}

export function continuationLabel(grading: GradingResult | null, isFollowup: boolean, isLastQuestion: boolean) {
  if (grading?.needs_followup && grading.followup_question && !isFollowup) return "Answer Follow-up";
  return isLastQuestion ? "Finish Interview" : "Next Question";
}
