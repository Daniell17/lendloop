import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignedBody } from "./lib/hmac";

const MAX_BODY_BYTES = 10_000;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function failureMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return "rejected";
}

async function readSigned(request: Request) {
  const secret = process.env.LENDLOOP_HMAC_SECRET ?? "";
  if (!secret) {
    return { ok: false as const, response: json({ error: "not_configured" }, 503) };
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return { ok: false as const, response: json({ error: "payload_too_large" }, 413) };
  }
  const verified = await verifySignedBody({
    secret,
    timestamp: request.headers.get(TIMESTAMP_HEADER),
    signature: request.headers.get(SIGNATURE_HEADER),
    rawBody,
  });
  if (!verified.ok) {
    return { ok: false as const, response: json({ error: verified.reason }, 401) };
  }
  try {
    const body: unknown = rawBody.length === 0 ? {} : JSON.parse(rawBody);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return { ok: false as const, response: json({ error: "invalid_json" }, 400) };
    }
    return { ok: true as const, body: body as Record<string, unknown> };
  } catch {
    return { ok: false as const, response: json({ error: "invalid_json" }, 400) };
  }
}

const overdue = httpAction(async (ctx, request) => {
  const signed = await readSigned(request);
  if (!signed.ok) return signed.response;
  const loans = await ctx.runQuery(internal.loans.overdue, {});
  return json({ loans }, 200);
});

const reminders = httpAction(async (ctx, request) => {
  const signed = await readSigned(request);
  if (!signed.ok) return signed.response;
  const { loanId, idempotencyKey, daysOverdue, outcome } = signed.body;
  if (
    typeof loanId !== "string" ||
    typeof idempotencyKey !== "string" ||
    typeof daysOverdue !== "number" ||
    (outcome !== "sent" && outcome !== "failed")
  ) {
    return json({ error: "invalid_body" }, 400);
  }
  try {
    const result = await ctx.runMutation(internal.automation.recordReminder, {
      loanId: loanId as Id<"loans">,
      idempotencyKey,
      daysOverdue,
      outcome,
    });
    return json(result, 200);
  } catch (error) {
    const message = failureMessage(error);
    const status = message === "Loan not found." ? 404 : 400;
    return json({ error: message }, status);
  }
});

const automationErrors = httpAction(async (ctx, request) => {
  const signed = await readSigned(request);
  if (!signed.ok) return signed.response;
  const { idempotencyKey, workflowName, message } = signed.body;
  if (
    typeof idempotencyKey !== "string" ||
    typeof workflowName !== "string" ||
    typeof message !== "string"
  ) {
    return json({ error: "invalid_body" }, 400);
  }
  try {
    const result = await ctx.runMutation(internal.automation.recordFailure, {
      idempotencyKey,
      workflowName,
      message,
    });
    return json(result, 200);
  } catch (error) {
    return json({ error: failureMessage(error) }, 400);
  }
});

const http = httpRouter();

http.route({
  path: "/overdue",
  method: "POST",
  handler: overdue,
});

http.route({
  path: "/reminders",
  method: "POST",
  handler: reminders,
});

http.route({
  path: "/automation-errors",
  method: "POST",
  handler: automationErrors,
});

export default http;
