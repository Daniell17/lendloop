export const TIMESTAMP_HEADER = "x-lendloop-timestamp";
export const SIGNATURE_HEADER = "x-lendloop-signature";
export const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot sign a non-finite number.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (isObject(value)) {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("Cannot sign this payload.");
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  const length = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    const leftCode = left.charCodeAt(index) || 0;
    const rightCode = right.charCodeAt(index) || 0;
    mismatch |= leftCode ^ rightCode;
  }
  return mismatch === 0;
}

export async function signBody(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  if (!secret) throw new Error("HMAC secret is empty.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = `${timestamp}.${rawBody}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return bytesToHex(signature);
}

export async function verifySignedBody(options: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  now?: number;
  maxSkewMs?: number;
}): Promise<VerifyResult> {
  const now = options.now ?? Date.now();
  const maxSkew = options.maxSkewMs ?? DEFAULT_MAX_SKEW_MS;
  const timestamp = options.timestamp?.trim() ?? "";
  const signature = options.signature?.trim().toLowerCase() ?? "";

  if (!/^\d{10,16}$/.test(timestamp)) {
    return { ok: false, reason: "missing_timestamp" };
  }
  if (!/^[0-9a-f]{64}$/.test(signature)) {
    return { ok: false, reason: "missing_signature" };
  }

  const expected = await signBody(options.secret, timestamp, options.rawBody);
  if (!timingSafeEqualHex(expected, signature)) {
    return { ok: false, reason: "invalid_signature" };
  }

  const skew = Math.abs(now - Number(timestamp));
  if (skew > maxSkew) {
    return { ok: false, reason: "stale_timestamp" };
  }
  return { ok: true };
}
