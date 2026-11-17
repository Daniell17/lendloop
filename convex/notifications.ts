import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { canonicalize, SIGNATURE_HEADER, signBody, TIMESTAMP_HEADER } from "./lib/hmac";
import { notificationKey } from "./lib/idempotency";

function recipientFor(
  status: string,
  loan: { lenderId: string; borrowerId: string },
  actorUserId: string,
): string {
  if (status === "pending") return loan.lenderId;
  if (status === "approved" || status === "declined") return loan.borrowerId;
  if (actorUserId === loan.borrowerId) return loan.lenderId;
  return loan.borrowerId;
}

export const dispatch = internalAction({
  args: {
    loanId: v.id("loans"),
    status: v.string(),
    actorUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const loan = await ctx.runQuery(internal.loans.getForNotify, { loanId: args.loanId });
    if (!loan) return;

    const already = await ctx.runQuery(internal.automation.notificationSent, {
      loanId: args.loanId,
      status: args.status,
    });
    if (already) return;

    const payload = {
      event: `loan.${args.status}`,
      idempotencyKey: notificationKey(args.loanId, args.status),
      loanId: args.loanId,
      recipientUserId: recipientFor(args.status, loan, args.actorUserId),
      status: args.status,
      toolName: loan.toolName,
    };
    const rawBody = canonicalize(payload);
    const secret = process.env.LENDLOOP_HMAC_SECRET ?? "";
    const url = process.env.N8N_REQUEST_WEBHOOK_URL ?? "";
    const failed = {
      loanId: args.loanId,
      status: args.status,
      kind: "notify_failed" as const,
      summary: "Notification failed",
    };

    if (!secret || !url) {
      await ctx.runMutation(internal.automation.recordNotification, failed);
      throw new Error("N8N_REQUEST_WEBHOOK_URL or LENDLOOP_HMAC_SECRET is not set.");
    }

    const timestamp = Date.now().toString();
    const signature = await signBody(secret, timestamp, rawBody);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signature,
        },
        body: rawBody,
      });
    } catch {
      await ctx.runMutation(internal.automation.recordNotification, failed);
      throw new Error("The request webhook could not be reached.");
    }

    if (!response.ok) {
      await ctx.runMutation(internal.automation.recordNotification, failed);
      throw new Error(`n8n webhook returned ${response.status}.`);
    }

    await ctx.runMutation(internal.automation.recordNotification, {
      loanId: args.loanId,
      status: args.status,
      kind: args.status === "pending" ? "request_notified" : "status_notified",
      summary:
        args.status === "pending"
          ? "Request notification sent"
          : `Status update sent (${args.status})`,
    });
  },
});
