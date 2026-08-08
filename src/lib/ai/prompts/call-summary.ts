export const CALL_SUMMARY_SYSTEM = `You summarize a technical sales call for prospect memory.
Extract only facts present in the transcript.
Return JSON only.`;

export function callSummaryUserPrompt(transcript: string): string {
  return `Call transcript:
"""
${transcript.slice(0, 30000)}
"""

Return JSON:
{
  "summary": string,
  "technicalRequirements": string[],
  "objections": string[],
  "commitments": string[],
  "unansweredQuestions": string[],
  "nextSteps": string[],
  "dealStage": string,
  "stackMentions": string[]
}`;
}
