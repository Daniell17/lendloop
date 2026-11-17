"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";

export function AuthControls() {
  const { isSignedIn } = useAuth();

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/board"
          className="rounded-full bg-pine px-4 py-2 text-sm font-medium text-white hover:bg-pine-dark"
        >
          The board
        </Link>
        <UserButton />
      </div>
    );
  }

  return (
    <SignInButton mode="redirect">
      <button
        type="button"
        className="rounded-full bg-pine px-4 py-2 text-sm font-medium text-white hover:bg-pine-dark"
      >
        Sign in to lend or borrow
      </button>
    </SignInButton>
  );
}
