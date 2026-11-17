import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  automationKindValidator,
  categoryValidator,
  conditionValidator,
  loanStatusValidator,
} from "./lib/validators";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkId: v.string(),
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_clerk", ["clerkId"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    removedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    toolName: v.string(),
    category: categoryValidator,
    borrowerId: v.id("users"),
    lenderId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool", ["toolId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_status", ["status"]),

  automationEvents: defineTable({
    loanId: v.id("loans"),
    kind: automationKindValidator,
    idempotencyKey: v.string(),
    summary: v.string(),
    createdAt: v.number(),
  })
    .index("by_loan", ["loanId"])
    .index("by_idempotency", ["idempotencyKey"]),

  automationFailures: defineTable({
    idempotencyKey: v.string(),
    workflowName: v.string(),
    message: v.string(),
    createdAt: v.number(),
  }).index("by_idempotency", ["idempotencyKey"]),
});
