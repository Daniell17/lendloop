/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import type * as auth_config from "../auth.config.js";
import type * as automation from "../automation.js";
import type * as http from "../http.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_hmac from "../lib/hmac.js";
import type * as lib_idempotency from "../lib/idempotency.js";
import type * as lib_labels from "../lib/labels.js";
import type * as lib_rbac from "../lib/rbac.js";
import type * as lib_rules from "../lib/rules.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_validators from "../lib/validators.js";
import type * as loans from "../loans.js";
import type * as notifications from "../notifications.js";
import type * as schema from "../schema.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

declare const fullApi: ApiFromModules<{
  "auth.config": typeof auth_config;
  automation: typeof automation;
  http: typeof http;
  "lib/activity": typeof lib_activity;
  "lib/auth": typeof lib_auth;
  "lib/dates": typeof lib_dates;
  "lib/hmac": typeof lib_hmac;
  "lib/idempotency": typeof lib_idempotency;
  "lib/labels": typeof lib_labels;
  "lib/rbac": typeof lib_rbac;
  "lib/rules": typeof lib_rules;
  "lib/text": typeof lib_text;
  "lib/validators": typeof lib_validators;
  loans: typeof loans;
  notifications: typeof notifications;
  schema: typeof schema;
  tools: typeof tools;
  users: typeof users;
}>;

export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
