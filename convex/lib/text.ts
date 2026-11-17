export function cleanShortText(
  value: string,
  min: number,
  max: number,
  label: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < min || trimmed.length > max) {
    return { ok: false, error: `${label} must be ${min}–${max} characters.` };
  }
  return { ok: true, value: trimmed };
}
