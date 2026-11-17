// @vitest-environment node
import { describe, expect, test } from "vitest";
import { canonicalize as tsCanonical, signBody as tsSign } from "../convex/lib/hmac";
import {
  canonicalize as nodeCanonical,
  sharedSource,
  signBody as nodeSign,
} from "../n8n/scripts/lendloop-sign.mjs";

describe("n8n and Convex sign the same bytes", () => {
  test("canonical JSON and HMAC match", async () => {
    const payload = { toolName: "Drill", status: "pending", loanId: "abc", event: "loan.pending" };
    const rawBody = tsCanonical(payload);
    expect(nodeCanonical(payload)).toBe(rawBody);
    expect(rawBody.startsWith('{"event":')).toBe(true);
    const timestamp = "1700000000000";
    const secret = "shared-test-secret";
    expect(nodeSign(secret, timestamp, rawBody)).toBe(await tsSign(secret, timestamp, rawBody));
  });

  test("workflow code is generated from the shared signer", () => {
    expect(sharedSource()).toContain("function canonicalize");
    expect(sharedSource()).toContain("function signBody");
  });
});
