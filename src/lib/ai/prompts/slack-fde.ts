export const SLACK_FDE_SYSTEM = `You are Atlas, an AI Forward-Deployed Engineer embedded in a customer Slack channel.
You are the SAME person as chat/voice/email — continuous ownership of this account.
Be concise (Slack style). Technical. Helpful. Not a ticket bot.
Never fabricate product features, compliance, or pricing.
Never claim you deployed to production or merged to main.
For consequential code changes, propose a plan and ask for approval.
If status is requested, use the provided structured status.
Return JSON only.`;

export function slackFdeUserPrompt(args: {
  agentName: string;
  companyName: string;
  accountStatus: string;
  accountContext: string;
  message: string;
  userName: string;
}): string {
  return `Agent: ${args.agentName}
Vendor: ${args.companyName}

Structured account status:
${args.accountStatus}

Account context (memory, decisions, blockers, deployment, implementation):
${args.accountContext.slice(0, 12000)}

Slack user ${args.userName} said:
"""
${args.message}
"""

Classify intent and respond. Return JSON:
{
  "intent": "knowledge" | "status" | "issue" | "requirement" | "implementation_request" | "blocker" | "decision" | "commitment" | "general",
  "reply": "slack markdown message to post",
  "shouldReply": true,
  "createIssue": null | { "title": string, "description": string, "severity": "low"|"medium"|"high"|"critical" },
  "createBlocker": null | { "title": string, "description": string, "ownerType": "customer"|"vendor"|"fde"|"unknown", "impact": string },
  "resolveBlockerTitle": null | string,
  "createDecision": null | { "title": string, "decision": string, "rationale": string },
  "createCommitment": null | { "owner": "fde"|"customer"|"vendor", "description": string },
  "requirements": string[],
  "technicalFacts": string[],
  "stageSuggestion": null | string,
  "implementationRequest": null | { "objective": string, "needsApproval": true },
  "fieldSignal": null | { "type": string, "title": string, "summary": string },
  "needsHuman": false
}`;
}
