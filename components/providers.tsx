"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function AppProviders({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <p className="text-sm font-medium tracking-wide text-copper uppercase">LendLoop</p>
        <h1 className="mt-3 font-serif text-4xl">Add a Convex URL to get started.</h1>
        <p className="mt-4 leading-7 text-muted">
          Set <code>NEXT_PUBLIC_CONVEX_URL</code> in <code>.env.local</code> and restart the
          dev server. The README walks through Clerk, Convex, and n8n.
        </p>
      </main>
    );
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
