import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot sign a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("Cannot sign this payload.");
}

export function timingSafeEqualHex(a, b) {
  const left = String(a).toLowerCase();
  const right = String(b).toLowerCase();
  const length = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export function signBody(secret, timestamp, rawBody) {
  const crypto = require("crypto");
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function sharedSource() {
  return [canonicalize, timingSafeEqualHex, signBody].map((fn) => fn.toString()).join("\n\n");
}
