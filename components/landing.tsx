"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/convex/lib/labels";
import { SiteHeader } from "@/components/site-header";

export function Landing() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <section className="max-w-2xl">
          <p className="text-sm font-medium tracking-[0.18em] text-copper uppercase">
            Neighborhood tool library
          </p>
          <h1 className="mt-4 font-serif text-5xl leading-[1.05] tracking-tight sm:text-6xl">
            Borrow what you need. Lend what you don&apos;t.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
            A small board for the drill, the tent, and the cake pan that should not
            have to be bought twice on the same street.
          </p>
        </section>

        <section className="mt-14" aria-labelledby="tool-list-heading">
          <div className="flex items-end justify-between gap-4">
            <h2 id="tool-list-heading" className="font-serif text-3xl">
              Tools on the board
            </h2>
            <p className="text-sm text-muted">Name and category only</p>
          </div>

          {tools === undefined ? (
            <p className="mt-6 text-muted">Loading the board…</p>
          ) : tools.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-line bg-card px-5 py-8 text-muted">
              Nothing is listed yet. Sign in to put the first tool up.
            </p>
          ) : (
            <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-card">
              <table className="w-full text-left">
                <thead className="bg-paper/70 text-sm text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium" scope="col">
                      Tool
                    </th>
                    <th className="px-5 py-3 font-medium" scope="col">
                      Category
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((tool, index) => (
                    <tr key={`${tool.name}-${tool.category}-${index}`} className="border-t border-line">
                      <td className="px-5 py-4 font-medium">{tool.name}</td>
                      <td className="px-5 py-4 text-muted">{categoryLabel(tool.category)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
