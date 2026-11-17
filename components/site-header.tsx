import Link from "next/link";
import { AuthControls } from "@/components/auth-controls";
import { Mark } from "@/components/mark";

export function SiteHeader() {
  return (
    <header className="border-b border-line/80 bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Mark />
          <span className="font-serif text-2xl tracking-tight">LendLoop</span>
        </Link>
        <AuthControls />
      </div>
    </header>
  );
}
