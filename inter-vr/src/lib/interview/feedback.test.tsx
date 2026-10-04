import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import AnswerFeedback from "../../components/interviewer/AnswerFeedback";
import { continuationLabel, parseGradingResult, type GradingResult } from "./grading";

const grading: GradingResult = {
  accuracy_score: 8, depth_score: 7, communication_score: 8, overall_score: 7.5,
  feedback: "Explain input validation in more detail.", needs_followup: false, is_complete: true,
};
const noop = () => {};

test("failed grading retains retry, re-record and continue controls on the last question", () => {
  const html = renderToStaticMarkup(<AnswerFeedback grading={null} transcript="Validate all input."
    error="The grading provider has reached its quota." isFollowup={false} isLastQuestion
    onRetry={noop} onRecordAgain={noop} onContinue={noop} />);
  for (const expected of ["Retry grading", "Record answer again", "Finish Interview", "quota", "Validate all input."]) {
    assert.ok(html.includes(expected), `Missing recovery UI: ${expected}`);
  }
  assert.ok(!html.includes("/10</span>"), "A failed request must not fabricate a zero score");
});

test("failed transcription also has a continuation path", () => {
  const html = renderToStaticMarkup(<AnswerFeedback grading={null} transcript="" error="Transcription timed out."
    isFollowup={false} isLastQuestion={false} onRetry={noop} onRecordAgain={noop} onContinue={noop} />);
  assert.ok(html.includes("Retry transcription"));
  assert.ok(html.includes("Next Question"));
});

test("a final-question follow-up takes precedence over finishing, but cannot repeat", () => {
  const followup = { ...grading, needs_followup: true, followup_question: "How do parameterized queries help?" };
  assert.equal(continuationLabel(followup, false, true), "Answer Follow-up");
  assert.equal(continuationLabel(followup, true, true), "Finish Interview");
  assert.equal(continuationLabel(followup, true, false), "Next Question");
});

test("error payloads and malformed scores cannot be treated as successful feedback", () => {
  for (const invalid of [undefined, null, { error: "Quota exceeded" }, { ...grading, overall_score: "8" },
    { ...grading, depth_score: NaN }, { ...grading, accuracy_score: 11 },
    { ...grading, needs_followup: true, followup_question: "" }]) {
    assert.throws(() => parseGradingResult(invalid));
  }
  assert.deepEqual(parseGradingResult(grading), grading);
});
