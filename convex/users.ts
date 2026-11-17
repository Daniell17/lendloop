import { ConvexError } from "convex/values";
import { v } from "convex/values";
import { actorFrom, adminClerkIds, displayName, requireUser } from "./lib/auth";
import { canMarkTrustedLender, canViewAllLoans } from "./lib/rbac";
import { mutation, query } from "./_generated/server";

export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in required.");

    const name = displayName(identity);
    const promote = adminClerkIds().has(identity.subject);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      const patch: { name?: string; role?: "admin" } = {};
      if (existing.name !== name) patch.name = name;
      if (promote && existing.role !== "admin") patch.role = "admin";
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(existing._id, patch);
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      clerkId: identity.subject,
      name,
      role: promote ? "admin" : "user",
      trustedLender: false,
      createdAt: Date.now(),
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});

export const setTrustedLender = mutation({
  args: {
    userId: v.id("users"),
    trusted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = actorFrom(await requireUser(ctx));
    if (!canMarkTrustedLender(actor)) {
      throw new ConvexError("Only an admin can mark a trusted lender.");
    }
    const lender = await ctx.db.get(args.userId);
    if (!lender) throw new ConvexError("That neighbor doesn't have a profile yet.");
    await ctx.db.patch(lender._id, { trustedLender: args.trusted });
    return { trusted: args.trusted };
  },
});

export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const actor = actorFrom(await requireUser(ctx));
    if (!canViewAllLoans(actor)) throw new ConvexError("Admins only.");

    const [people, tools] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("tools").collect(),
    ]);
    const listings = new Map<string, number>();
    for (const tool of tools) {
      if (tool.removedAt !== undefined) continue;
      listings.set(tool.ownerId, (listings.get(tool.ownerId) ?? 0) + 1);
    }

    return people
      .map((person) => ({
        _id: person._id,
        name: person.name,
        role: person.role,
        trustedLender: person.trustedLender,
        listingCount: listings.get(person._id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
