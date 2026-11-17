import { ConvexError } from "convex/values";
import { v } from "convex/values";
import { actorFrom, requireUser } from "./lib/auth";
import { daysBetween, utcToday } from "./lib/dates";
import { isErrorKey, parseReminderKey, notificationKey, writeBackDecision } from "./lib/idempotency";
import { canViewAllLoans } from "./lib/rbac";
import { isOverdue } from "./lib/rules";
import { internalMutation, internalQuery, query } from "./_generated/server";

export const notificationSent = internalQuery({
  args: {
    loanId: v.id("loans"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const key = notificationKey(args.loanId, args.status);
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", key))
      .unique();
    return existing !== null;
  },
});

export const recordNotification = internalMutation({
  args: {
    loanId: v.id("loans"),
    status: v.string(),
    kind: v.union(
      v.literal("request_notified"),
      v.literal("status_notified"),
      v.literal("notify_failed"),
    ),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const successKey = notificationKey(args.loanId, args.status);
    if (args.kind !== "notify_failed") {
      const existing = await ctx.db
        .query("automationEvents")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", successKey))
        .unique();
      if (writeBackDecision(existing) === "duplicate") {
        return { duplicate: true as const };
      }
    }
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new ConvexError("Loan not found.");
    await ctx.db.insert("automationEvents", {
      loanId: loan._id,
      kind: args.kind,
      idempotencyKey:
        args.kind === "notify_failed" ? `${successKey}:failed:${Date.now()}` : successKey,
      summary: args.summary.slice(0, 160),
      createdAt: Date.now(),
    });
    return { duplicate: false as const };
  },
});

export const recordReminder = internalMutation({
  args: {
    loanId: v.id("loans"),
    idempotencyKey: v.string(),
    daysOverdue: v.number(),
    outcome: v.union(v.literal("sent"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    const parsed = parseReminderKey(args.idempotencyKey, args.loanId);
    if (!parsed.ok) throw new ConvexError(parsed.reason);

    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (writeBackDecision(existing) === "duplicate" && existing) {
      return { duplicate: true as const, eventId: existing._id };
    }

    const today = utcToday();
    const yesterday = utcToday(Date.parse(`${today}T00:00:00.000Z`) - 86_400_000);
    if (parsed.date !== today && parsed.date !== yesterday) {
      throw new ConvexError("idempotency_key_expired");
    }

    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new ConvexError("Loan not found.");
    if (!isOverdue(loan, today)) throw new ConvexError("Loan is not overdue.");
    if (args.daysOverdue !== daysBetween(loan.endDate, today)) {
      throw new ConvexError("days_overdue_mismatch");
    }

    const eventId = await ctx.db.insert("automationEvents", {
      loanId: loan._id,
      kind: args.outcome === "sent" ? "reminder_sent" : "reminder_failed",
      idempotencyKey: args.idempotencyKey,
      summary: args.outcome === "sent" ? "Reminder sent" : "Reminder failed",
      createdAt: Date.now(),
    });
    return { duplicate: false as const, eventId };
  },
});

export const recordFailure = internalMutation({
  args: {
    idempotencyKey: v.string(),
    workflowName: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    if (!isErrorKey(args.idempotencyKey)) {
      throw new ConvexError("invalid_idempotency_key");
    }
    const workflowName = args.workflowName.trim().slice(0, 120);
    const message = args.message.trim().slice(0, 300);
    if (!workflowName || !message) throw new ConvexError("Missing failure details.");

    const existing = await ctx.db
      .query("automationFailures")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (writeBackDecision(existing) === "duplicate") {
      return { duplicate: true as const };
    }
    await ctx.db.insert("automationFailures", {
      idempotencyKey: args.idempotencyKey,
      workflowName,
      message,
      createdAt: Date.now(),
    });
    return { duplicate: false as const };
  },
});

export const listFailures = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!canViewAllLoans(actorFrom(user))) throw new ConvexError("Admins only.");
    const rows = await ctx.db.query("automationFailures").collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((row) => ({
        workflowName: row.workflowName,
        message: row.message,
        createdAt: row.createdAt,
      }));
  },
});
