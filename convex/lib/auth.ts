import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Actor } from "./rbac";

type ReadCtx = QueryCtx | MutationCtx;

export function adminClerkIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_CLERK_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function displayName(identity: {
  name?: string | null;
  givenName?: string | null;
}): string {
  const name = identity.name?.trim() || identity.givenName?.trim() || "Neighbor";
  return name.slice(0, 80);
}

export async function getCurrentUser(ctx: ReadCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: ReadCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new ConvexError("Sign in required.");
  }
  return user;
}

export function actorFrom(user: Doc<"users">): Actor {
  return { userId: user._id, role: user.role };
}
