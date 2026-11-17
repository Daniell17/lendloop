import { ConvexError } from "convex/values";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { actorFrom, requireUser } from "./lib/auth";
import { formatCalendarDate, utcToday } from "./lib/dates";
import { canDeleteListing, canEditListing } from "./lib/rbac";
import {
  availabilityFor,
  currentBooking,
  hasOpenLoan,
  nextBooking,
} from "./lib/rules";
import { cleanShortText } from "./lib/text";
import { categoryValidator, conditionValidator } from "./lib/validators";
import { mutation, query } from "./_generated/server";

function activeTools(tools: Doc<"tools">[]) {
  return tools.filter((tool) => tool.removedAt === undefined);
}

async function loansForTools(ctx: QueryCtx | MutationCtx, toolIds: Id<"tools">[]) {
  const wanted = new Set(toolIds.map(String));
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_status", (q) => q.eq("status", "approved"))
    .collect();
  const grouped = new Map<string, Doc<"loans">[]>();
  for (const loan of approved) {
    const key = String(loan.toolId);
    if (!wanted.has(key)) continue;
    const list = grouped.get(key) ?? [];
    list.push(loan);
    grouped.set(key, list);
  }
  return grouped;
}

function availabilityLabel(loans: Doc<"loans">[], today: string) {
  const dated = loans.map((loan) => ({
    status: loan.status,
    startDate: loan.startDate,
    endDate: loan.endDate,
  }));
  const availability = availabilityFor(dated, today);
  if (availability.state === "on_loan") {
    const current = currentBooking(dated, today);
    return {
      state: "on_loan" as const,
      label: current
        ? `On loan until ${formatCalendarDate(current.endDate)}`
        : "On loan",
    };
  }
  if (availability.upcoming) {
    const next = nextBooking(dated, today);
    return {
      state: "available" as const,
      label: next
        ? `Available · booked ${formatCalendarDate(next.startDate)}–${formatCalendarDate(next.endDate)}`
        : "Available",
    };
  }
  return { state: "available" as const, label: "Available" };
}

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = activeTools(await ctx.db.query("tools").collect());
    return tools
      .map((tool) => ({
        name: tool.name,
        category: tool.category,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const tools = activeTools(await ctx.db.query("tools").collect());
    const today = utcToday();
    const loans = await loansForTools(
      ctx,
      tools.map((tool) => tool._id),
    );
    const owners = new Map<string, Doc<"users"> | null>();

    const rows = [];
    for (const tool of tools) {
      const ownerKey = String(tool.ownerId);
      if (!owners.has(ownerKey)) {
        owners.set(ownerKey, await ctx.db.get(tool.ownerId));
      }
      const owner = owners.get(ownerKey);
      const toolLoans = loans.get(String(tool._id)) ?? [];
      const status = availabilityLabel(toolLoans, today);
      rows.push({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        ownerName: owner?.name ?? "Neighbor",
        ownerTrusted: owner?.trustedLender ?? false,
        isOwner: tool.ownerId === user._id,
        availability: status.state,
        availabilityLabel: status.label,
      });
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const tools = activeTools(
      await ctx.db
        .query("tools")
        .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
        .collect(),
    );
    return tools
      .map((tool) => ({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        updatedAt: tool.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

function readListing(name: string, description: string) {
  const cleanName = cleanShortText(name, 2, 60, "Tool name");
  if (!cleanName.ok) throw new ConvexError(cleanName.error);
  const cleanDescription = cleanShortText(description, 2, 400, "Description");
  if (!cleanDescription.ok) throw new ConvexError(cleanDescription.error);
  return { name: cleanName.value, description: cleanDescription.value };
}

export const create = mutation({
  args: {
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const listing = readListing(args.name, args.description);
    const now = Date.now();
    return await ctx.db.insert("tools", {
      ownerId: user._id,
      name: listing.name,
      category: args.category,
      condition: args.condition,
      description: listing.description,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.removedAt !== undefined) {
      throw new ConvexError("That listing is no longer on the board.");
    }
    if (!canEditListing(actorFrom(user), { ownerId: tool.ownerId })) {
      throw new ConvexError("You can only edit your own listings.");
    }
    const listing = readListing(args.name, args.description);
    await ctx.db.patch(tool._id, {
      name: listing.name,
      category: args.category,
      condition: args.condition,
      description: listing.description,
      updatedAt: Date.now(),
    });
    return tool._id;
  },
});

export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.removedAt !== undefined) {
      throw new ConvexError("That listing is no longer on the board.");
    }
    if (!canDeleteListing(actorFrom(user), { ownerId: tool.ownerId })) {
      throw new ConvexError("You can only remove your own listings.");
    }
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .collect();
    if (hasOpenLoan(loans)) {
      throw new ConvexError("Resolve open requests before removing this listing.");
    }
    await ctx.db.patch(tool._id, { removedAt: Date.now(), updatedAt: Date.now() });
    return { removed: true };
  },
});
