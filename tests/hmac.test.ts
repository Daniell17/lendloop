import { describe, expect, test } from "vitest";
import { canonicalize, signBody, timingSafeEqualHex, verifySignedBody } from "../convex/lib/hmac";

const secret = "test-secret";
const now = 1_700_000_000_000;

describe("canonical payloads", () => {
  test("sorts object keys and ignores undefined", () => {
    expect(canonicalize({ b: 1, a: "drill", c: undefined })).toBe('{"a":"drill","b":1}');
  });

  test("keeps array order", () => {
    expect(canonicalize(["b", "a"])).toBe('["b","a"]');
  });
});

describe("HMAC verification", () => {
  test("accepts a fresh signature over the exact body", async () => {
    const rawBody = canonicalize({ status: "pending", toolName: "Drill" });
    const timestamp = String(now);
    const signature = await signBody(secret, timestamp, rawBody);
    const result = await verifySignedBody({
      secret,
      timestamp,
      signature,
      rawBody,
      now,
    });
    expect(result).toEqual({ ok: true });
  });

  test("rejects a body that was changed after signing", async () => {
    const timestamp = String(now);
    const signature = await signBody(secret, timestamp, '{"a":1}');
    const result = await verifySignedBody({
      secret,
      timestamp,
      signature,
      rawBody: '{"a":2}',
      now,
    });
    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  test("rejects the wrong secret", async () => {
    const rawBody = "{}";
    const timestamp = String(now);
    const signature = await signBody("other-secret", timestamp, rawBody);
    const result = await verifySignedBody({ secret, timestamp, signature, rawBody, now });
    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  test("rejects a stale timestamp even when the signature matches", async () => {
    const rawBody = "{}";
    const timestamp = String(now - 10 * 60 * 1000);
    const signature = await signBody(secret, timestamp, rawBody);
    const result = await verifySignedBody({ secret, timestamp, signature, rawBody, now });
    expect(result).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  test("rejects a missing or malformed signature without throwing", async () => {
    const missing = await verifySignedBody({
      secret,
      timestamp: String(now),
      signature: null,
      rawBody: "{}",
      now,
    });
    expect(missing.ok).toBe(false);
    expect(timingSafeEqualHex("abc", "abd")).toBe(false);
    expect(timingSafeEqualHex("abc", "abc")).toBe(true);
  });
});
