"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityList } from "@/components/activity-list";
import { errorText } from "@/components/error-text";
import { SiteHeader } from "@/components/site-header";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { categoryLabel, conditionLabel, CATEGORIES, CONDITIONS } from "@/convex/lib/labels";
import { utcToday } from "@/convex/lib/dates";

type View = "catalog" | "listings" | "requests" | "incoming" | "admin";

const fieldClass =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none";
const buttonClass =
  "rounded-full bg-pine px-4 py-2 text-sm font-medium text-white hover:bg-pine-dark disabled:opacity-50";
const quietButtonClass =
  "rounded-full border border-line bg-white px-4 py-2 text-sm font-medium hover:border-ink disabled:opacity-50";

export function BoardApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const store = useMutation(api.users.store);
  const me = useQuery(api.users.me);
  const [view, setView] = useState<View>("catalog");
  const [setupError, setSetupError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || started.current) return;
    started.current = true;
    void store().catch((error: unknown) => setSetupError(errorText(error)));
  }, [isAuthenticated, store]);

  const tabs: Array<{ id: View; label: string }> = [
    { id: "catalog", label: "All tools" },
    { id: "listings", label: "My listings" },
    { id: "requests", label: "My requests" },
    { id: "incoming", label: "Incoming requests" },
  ];
  if (me?.role === "admin") tabs.push({ id: "admin", label: "Admin" });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-serif text-4xl tracking-tight">The board</h1>
            <p className="mt-2 text-muted">
              {me ? `Signed in as ${me.name}${me.trustedLender ? " · Trusted lender" : ""}` : "Loading your profile…"}
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Board views">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              onClick={() => setView(tab.id)}
              className={`rounded-full px-4 py-2 text-sm whitespace-nowrap ${
                view === tab.id ? "bg-ink text-white" : "bg-card text-ink ring-1 ring-line"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-8">
          {setupError ? <ErrorNote message={setupError} /> : null}
          {isLoading || me === undefined ? (
            <p className="text-muted">Loading the board…</p>
          ) : me === null ? (
            <p className="text-muted">Setting up your profile…</p>
          ) : view === "catalog" ? (
            <Catalog isAdmin={me.role === "admin"} />
          ) : view === "listings" ? (
            <Listings />
          ) : view === "requests" ? (
            <MyRequests />
          ) : view === "incoming" ? (
            <Incoming />
          ) : (
            <AdminPanel />
          )}
        </div>
      </main>
    </div>
  );
}

function Catalog({ isAdmin }: { isAdmin: boolean }) {
  const tools = useQuery(api.tools.list);
  const requestLoan = useMutation(api.loans.request);
  const removeTool = useMutation(api.tools.remove);
  const [category, setCategory] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(utcToday());
  const [endDate, setEndDate] = useState(utcToday());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const visible = useMemo(
    () => (tools ?? []).filter((tool) => category === "all" || tool.category === category),
    [tools, category],
  );

  async function submitRequest(event: FormEvent, toolId: Id<"tools">) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await requestLoan({ toolId, startDate, endDate });
      setOpenId(null);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setPending(false);
    }
  }

  async function remove(toolId: Id<"tools">) {
    setError(null);
    try {
      await removeTool({ toolId });
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  if (tools === undefined) return <p className="text-muted">Loading tools…</p>;

  return (
    <section aria-labelledby="catalog-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="catalog-heading" className="font-serif text-3xl">
          All tools
        </h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
            All
          </FilterChip>
          {CATEGORIES.map((item) => (
            <FilterChip
              key={item.value}
              active={category === item.value}
              onClick={() => setCategory(item.value)}
            >
              {item.label}
            </FilterChip>
          ))}
        </div>
      </div>
      {error ? <ErrorNote message={error} /> : null}
      {visible.length === 0 ? (
        <p className="mt-6 text-muted">No tools in this category yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {visible.map((tool) => (
            <article key={tool._id} className="rounded-2xl border border-line bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{tool.name}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {categoryLabel(tool.category)} · {conditionLabel(tool.condition)}
                  </p>
                </div>
                <Availability state={tool.availability} label={tool.availabilityLabel} />
              </div>
              <p className="mt-3 text-sm leading-6">{tool.description}</p>
              <p className="mt-3 text-sm text-muted">
                {tool.ownerName}
                {tool.ownerTrusted ? " · Trusted lender" : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {tool.isOwner ? (
                  <span className="text-sm text-muted">This is your listing.</span>
                ) : (
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => setOpenId(openId === tool._id ? null : tool._id)}
                  >
                    Request to borrow
                  </button>
                )}
                {tool.isOwner || isAdmin ? (
                  <button type="button" className={quietButtonClass} onClick={() => void remove(tool._id)}>
                    Remove
                  </button>
                ) : null}
              </div>
              {openId === tool._id ? (
                <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submitRequest(event, tool._id)}>
                  <label className="text-sm">
                    Start
                    <input className={`${fieldClass} mt-1`} type="date" required min={utcToday()} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                  </label>
                  <label className="text-sm">
                    End
                    <input className={`${fieldClass} mt-1`} type="date" required min={startDate || utcToday()} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                  </label>
                  <p className="text-xs text-muted sm:col-span-2">Dates are UTC calendar dates.</p>
                  <button className={buttonClass} type="submit" disabled={pending}>
                    {pending ? "Sending…" : "Send request"}
                  </button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Listings() {
  const listings = useQuery(api.tools.mine);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>("power_tools");
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]["value"]>("good");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
    setEditing(null);
    setName("");
    setCategory("power_tools");
    setCondition("good");
    setDescription("");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (editing) {
        await update({ toolId: editing, name, category, condition, description });
      } else {
        await create({ name, category, condition, description });
      }
      reset();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="listings-heading">
      <h2 id="listings-heading" className="font-serif text-3xl">
        My listings
      </h2>
      <form onSubmit={(event) => void onSubmit(event)} className="mt-6 grid gap-3 rounded-2xl border border-line bg-card p-5">
        <label className="text-sm">
          Name
          <input className={`${fieldClass} mt-1`} value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Category
            <select className={`${fieldClass} mt-1`} value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Condition
            <select className={`${fieldClass} mt-1`} value={condition} onChange={(event) => setCondition(event.target.value as typeof condition)}>
              {CONDITIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="text-sm">
          Short description
          <textarea className={`${fieldClass} mt-1 min-h-24`} value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={400} />
        </label>
        {error ? <ErrorNote message={error} /> : null}
        <div className="flex gap-2">
          <button className={buttonClass} type="submit" disabled={pending}>
            {editing ? "Save changes" : "List this tool"}
          </button>
          {editing ? (
            <button className={quietButtonClass} type="button" onClick={reset}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>
      <div className="mt-6 grid gap-3">
        {listings === undefined ? (
          <p className="text-muted">Loading your listings…</p>
        ) : listings.length === 0 ? (
          <p className="text-muted">You have not listed a tool yet.</p>
        ) : (
          listings.map((tool) => (
            <article key={tool._id} className="rounded-2xl border border-line bg-card p-5">
              <h3 className="font-semibold">{tool.name}</h3>
              <p className="mt-1 text-sm text-muted">
                {categoryLabel(tool.category)} · {conditionLabel(tool.condition)}
              </p>
              <p className="mt-2 text-sm leading-6">{tool.description}</p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className={quietButtonClass}
                  onClick={() => {
                    setEditing(tool._id);
                    setName(tool.name);
                    setCategory(tool.category);
                    setCondition(tool.condition);
                    setDescription(tool.description);
                    setError(null);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={quietButtonClass}
                  onClick={() => {
                    setError(null);
                    void remove({ toolId: tool._id }).catch((caught: unknown) => setError(errorText(caught)));
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function MyRequests() {
  const loans = useQuery(api.loans.mine);
  const cancel = useMutation(api.loans.cancel);
  const markReturned = useMutation(api.loans.markReturned);
  const [error, setError] = useState<string | null>(null);

  return (
    <section aria-labelledby="requests-heading">
      <h2 id="requests-heading" className="font-serif text-3xl">
        My requests
      </h2>
      {error ? <ErrorNote message={error} /> : null}
      <LoanList
        loans={loans}
        empty="You have not asked to borrow anything yet."
        renderActions={(loan) => (
          <>
            {loan.status === "pending" ? (
              <button
                type="button"
                className={quietButtonClass}
                onClick={() => {
                  setError(null);
                  void cancel({ loanId: loan._id }).catch((caught: unknown) => setError(errorText(caught)));
                }}
              >
                Cancel request
              </button>
            ) : null}
            {loan.status === "approved" ? (
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  setError(null);
                  void markReturned({ loanId: loan._id }).catch((caught: unknown) => setError(errorText(caught)));
                }}
              >
                Mark returned
              </button>
            ) : null}
          </>
        )}
      />
    </section>
  );
}

function Incoming() {
  const loans = useQuery(api.loans.incoming);
  const decide = useMutation(api.loans.decide);
  const markReturned = useMutation(api.loans.markReturned);
  const [error, setError] = useState<string | null>(null);

  async function respond(loanId: Id<"loans">, decision: "approved" | "declined") {
    setError(null);
    try {
      await decide({ loanId, decision });
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  return (
    <section aria-labelledby="incoming-heading">
      <h2 id="incoming-heading" className="font-serif text-3xl">
        Incoming requests
      </h2>
      {error ? <ErrorNote message={error} /> : null}
      <LoanList
        loans={loans}
        empty="When a neighbor asks to borrow something of yours, it shows up here."
        renderActions={(loan) => (
          <>
            {loan.status === "pending" ? (
              <>
                <button type="button" className={buttonClass} onClick={() => void respond(loan._id, "approved")}>
                  Approve
                </button>
                <button type="button" className={quietButtonClass} onClick={() => void respond(loan._id, "declined")}>
                  Decline
                </button>
              </>
            ) : null}
            {loan.status === "approved" ? (
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  setError(null);
                  void markReturned({ loanId: loan._id }).catch((caught: unknown) => setError(errorText(caught)));
                }}
              >
                Mark returned
              </button>
            ) : null}
          </>
        )}
      />
    </section>
  );
}

function AdminPanel() {
  const loans = useQuery(api.loans.all);
  const people = useQuery(api.users.listForAdmin);
  const failures = useQuery(api.automation.listFailures);
  const setTrusted = useMutation(api.users.setTrustedLender);
  const [error, setError] = useState<string | null>(null);

  return (
    <section aria-labelledby="admin-heading" className="space-y-10">
      <div>
        <h2 id="admin-heading" className="font-serif text-3xl">
          Admin
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Admins can remove any listing from All tools, review every loan, and mark a neighbor as a trusted lender. Those checks run inside Convex, not only in this screen.
        </p>
      </div>
      {error ? <ErrorNote message={error} /> : null}

      <div>
        <h3 className="font-serif text-2xl">Neighbors</h3>
        <div className="mt-4 grid gap-3">
          {people === undefined ? (
            <p className="text-muted">Loading neighbors…</p>
          ) : (
            people.map((person) => (
              <div key={person._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3">
                <div>
                  <p className="font-medium">
                    {person.name}
                    {person.role === "admin" ? " · Admin" : ""}
                  </p>
                  <p className="text-sm text-muted">
                    {person.listingCount} listing{person.listingCount === 1 ? "" : "s"}
                    {person.trustedLender ? " · Trusted lender" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className={quietButtonClass}
                  onClick={() => {
                    setError(null);
                    void setTrusted({ userId: person._id, trusted: !person.trustedLender }).catch((caught: unknown) =>
                      setError(errorText(caught)),
                    );
                  }}
                >
                  {person.trustedLender ? "Remove trusted" : "Mark trusted lender"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <h3 className="font-serif text-2xl">All loans</h3>
        <LoanList loans={loans} empty="No loans yet." renderActions={() => null} />
      </div>

      <div>
        <h3 className="font-serif text-2xl">Automation failures</h3>
        <div className="mt-4 grid gap-3">
          {failures === undefined ? (
            <p className="text-muted">Loading failures…</p>
          ) : failures.length === 0 ? (
            <p className="text-muted">No failed automation runs have been reported.</p>
          ) : (
            failures.map((failure) => (
              <article key={`${failure.createdAt}-${failure.workflowName}`} className="rounded-2xl border border-line bg-card p-4">
                <p className="font-medium">{failure.workflowName}</p>
                <p className="mt-1 text-sm leading-6">{failure.message}</p>
                <p className="mt-2 text-xs text-muted">{new Date(failure.createdAt).toISOString()}</p>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

type LoanRow = {
  _id: Id<"loans">;
  toolName: string;
  category: string;
  startDate: string;
  endDate: string;
  status: string;
  borrowerName: string;
  lenderName: string;
  activity: Array<{ kind: string; summary: string; createdAt: number }>;
};

function LoanList({
  loans,
  empty,
  renderActions,
}: {
  loans: LoanRow[] | undefined;
  empty: string;
  renderActions: (loan: LoanRow) => ReactNode;
}) {
  if (loans === undefined) return <p className="mt-6 text-muted">Loading loans…</p>;
  if (loans.length === 0) return <p className="mt-6 text-muted">{empty}</p>;
  return (
    <div className="mt-6 grid gap-3">
      {loans.map((loan) => (
        <article key={loan._id} className="rounded-2xl border border-line bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{loan.toolName}</h3>
              <p className="mt-1 text-sm text-muted">
                {categoryLabel(loan.category)} · {loan.startDate} to {loan.endDate}
              </p>
              <p className="mt-1 text-sm text-muted">
                {loan.borrowerName} borrowing from {loan.lenderName}
              </p>
            </div>
            <span className="rounded-full bg-paper px-3 py-1 text-sm capitalize">{loan.status}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">{renderActions(loan)}</div>
          <div className="mt-4 border-t border-line pt-3">
            <ActivityList activity={loan.activity} />
          </div>
        </article>
      ))}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm ${active ? "bg-pine text-white" : "bg-card ring-1 ring-line"}`}
    >
      {children}
    </button>
  );
}

function Availability({ state, label }: { state: "available" | "on_loan"; label: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        state === "available" ? "bg-pine/10 text-pine-dark" : "bg-copper/10 text-copper"
      }`}
    >
      {label}
    </span>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}
