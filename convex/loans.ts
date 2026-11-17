import { ConvexError } from "convex/values";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { actorFrom, requireUser } from "./lib/auth";
import { daysBetween, utcToday } from "./lib/dates";
import {
  canCancelRequest,
  canDecideRequest,
  canMarkReturned,
  canRequestBorrow,
  canViewAllLoans,
  canViewLoan,
} from "./lib/rbac";
import { approvedOverlap, borrowerConflict, isOverdue, parseBorrowRange } from "./lib/rules";
import { internalQuery, mutation, query } from "./_generated/server";

async function presentLoan(
  ctx: QueryCtx | MutationCtx,
  loan: Doc<"loans">,
  viewerId: string,
) {
  const [borrower, lender, events] = await Promise.all([
    ctx.db.get(loan.borrowerId),
    ctx.db.get(loan.lenderId),
    ctx.db
      .query("automationEvents")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .collect(),
  ]);
  events.sort((a, b) => b.createdAt - a.createdAt);
  return {
    _id: loan._id,
    toolId: loan.toolId,
    toolName: loan.toolName,
    category: loan.category,
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    borrowerName: borrower?.name ?? "Neighbor",
    lenderName: lender?.name ?? "Neighbor",
    isBorrower: loan.borrowerId === viewerId,
    isLender: loan.lenderId === viewerId,
    activity: events.slice(0, 5).map((event) => ({
      kind: event.kind,
      summary: event.summary,
      createdAt: event.createdAt,
    })),
  };
}

async function scheduleStatus(
  ctx: MutationCtx,
  loanId: Doc<"loans">["_id"],
  status: Doc<"loans">["status"],
  actorUserId: string,
) {
  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    loanId,
    status,
    actorUserId,
  });
}

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.removedAt !== undefined) {
      throw new ConvexError("That tool is no longer listed.");
    }
    if (!canRequestBorrow(actorFrom(user), { ownerId: tool.ownerId })) {
      throw new ConvexError("You can't borrow your own tool.");
    }
    const range = parseBorrowRange(args.startDate, args.endDate);
    if (!range.ok) throw new ConvexError(range.error);

    const existing = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .collect();
    if (approvedOverlap(existing, args.startDate, args.endDate)) {
      throw new ConvexError("Those dates overlap a loan that's already approved.");
    }
    const conflict = borrowerConflict(existing, user._id, args.startDate, args.endDate);
    if (conflict) throw new ConvexError(conflict);

    const now = Date.now();
    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      toolName: tool.name,
      category: tool.category,
      borrowerId: user._id,
      lenderId: tool.ownerId,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await scheduleStatus(ctx, loanId, "pending", user._id);
    return loanId;
  },
});

export const decide = mutation({
  args: {
    loanId: v.id("loans"),
    decision: v.union(v.literal("approved"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new ConvexError("That request no longer exists.");
    if (!canDecideRequest(actorFrom(user), loan)) {
      throw new ConvexError("Only the lender can respond to a pending request.");
    }
    if (args.decision === "approved") {
      const existing = await ctx.db
        .query("loans")
        .withIndex("by_tool", (q) => q.eq("toolId", loan.toolId))
        .collect();
      const others = existing.filter((item) => item._id !== loan._id);
      if (approvedOverlap(others, loan.startDate, loan.endDate)) {
        throw new ConvexError("Those dates overlap a loan that's already approved.");
      }
    }
    await ctx.db.patch(loan._id, {
      status: args.decision,
      updatedAt: Date.now(),
    });
    await scheduleStatus(ctx, loan._id, args.decision, user._id);
    return { status: args.decision };
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new ConvexError("That loan no longer exists.");
    if (!canMarkReturned(actorFrom(user), loan)) {
      throw new ConvexError("You can only mark your own approved loans returned.");
    }
    const now = Date.now();
    await ctx.db.patch(loan._id, {
      status: "returned",
      updatedAt: now,
      returnedAt: now,
    });
    await scheduleStatus(ctx, loan._id, "returned", user._id);
    return { status: "returned" as const };
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new ConvexError("That request no longer exists.");
    if (!canCancelRequest(actorFrom(user), loan)) {
      throw new ConvexError("You can only cancel your own pending request.");
    }
    await ctx.db.patch(loan._id, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
    await scheduleStatus(ctx, loan._id, "cancelled", user._id);
    return { status: "cancelled" as const };
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .collect();
    const rows = [];
    for (const loan of loans) {
      if (!canViewLoan(actorFrom(user), loan)) continue;
      rows.push(await presentLoan(ctx, loan, user._id));
    }
    return rows.sort((a, b) => b.startDate.localeCompare(a.startDate));
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
      .collect();
    const rows = [];
    for (const loan of loans) {
      if (!canViewLoan(actorFrom(user), loan)) continue;
      rows.push(await presentLoan(ctx, loan, user._id));
    }
    return rows.sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return b.startDate.localeCompare(a.startDate);
    });
  },
});

export const all = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!canViewAllLoans(actorFrom(user))) throw new ConvexError("Admins only.");
    const loans = await ctx.db.query("loans").collect();
    const rows = [];
    for (const loan of loans) {
      rows.push(await presentLoan(ctx, loan, user._id));
    }
    return rows.sort((a, b) => b.startDate.localeCompare(a.startDate));
  },
});

export const getForNotify = internalQuery({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanId);
    if (!loan) return null;
    return {
      loanId: loan._id,
      status: loan.status,
      lenderId: loan.lenderId,
      borrowerId: loan.borrowerId,
      toolName: loan.toolName,
    };
  },
});

export const overdue = internalQuery({
  args: {},
  handler: async (ctx) => {
    const today = utcToday();
    const approved = await ctx.db
      .query("loans")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();
    return approved
      .filter((loan) => isOverdue(loan, today))
      .map((loan) => ({
        loanId: loan._id,
        toolName: loan.toolName,
        borrowerId: loan.borrowerId,
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
      }));
  },
});
