import { ConvexError } from "convex/values";

export function errorText(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data: unknown }).data;
    if (typeof data === "string") return data;
  }
  return "Something went wrong. Please try again.";
}
