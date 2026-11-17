import { v } from "convex/values";

export const categoryValidator = v.union(
  v.literal("power_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("other"),
);

export const conditionValidator = v.union(
  v.literal("excellent"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("needs_repair"),
);

export const loanStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned"),
  v.literal("cancelled"),
);

export const automationKindValidator = v.union(
  v.literal("request_notified"),
  v.literal("status_notified"),
  v.literal("reminder_sent"),
  v.literal("reminder_failed"),
  v.literal("notify_failed"),
);
