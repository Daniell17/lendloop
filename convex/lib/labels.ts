export const CATEGORIES = [
  { value: "power_tools", label: "Power tools" },
  { value: "garden", label: "Garden" },
  { value: "kitchen", label: "Kitchen" },
  { value: "camping", label: "Camping" },
  { value: "other", label: "Other" },
] as const;

export const CONDITIONS = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "needs_repair", label: "Needs repair" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];
export type Condition = (typeof CONDITIONS)[number]["value"];

const CATEGORY_VALUES = new Set<string>(CATEGORIES.map((item) => item.value));
const CONDITION_VALUES = new Set<string>(CONDITIONS.map((item) => item.value));

export function isCategory(value: string): value is Category {
  return CATEGORY_VALUES.has(value);
}

export function isCondition(value: string): value is Condition {
  return CONDITION_VALUES.has(value);
}

export function categoryLabel(value: string): string {
  return CATEGORIES.find((item) => item.value === value)?.label ?? value;
}

export function conditionLabel(value: string): string {
  return CONDITIONS.find((item) => item.value === value)?.label ?? value;
}
