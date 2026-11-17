/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { daysBetween, utcToday } from "../convex/lib/dates";
import { canonicalize, signBody } from "../convex/lib/hmac";

const modules = import.meta.glob("../convex/**/*.*s");
const SECRET = "unit-test-secret";

function person(subject: string, name: string) {
  return {
    subject,
    issuer: "https://example.clerk.accounts.dev",
    tokenIdentifier: `https://example.clerk.accounts.dev|${subject}`,
    name,
  };
}

beforeEach(() => {
  process.env.LENDLOOP_HMAC_SECRET = SECRET;
  process.env.ADMIN_CLERK_IDS = "user_admin";
  delete process.env.N8N_REQUEST_WEBHOOK_URL;
});

describe("Convex enforces roles", () => {
  test("neighbors cannot remove or trust on someone else's behalf", async () => {
    const t = convexTest(schema, modules);
    const ada = t.withIdentity(person("user_ada", "Ada"));
    const ben = t.withIdentity(person("user_ben", "Ben"));
    const admin = t.withIdentity(person("user_admin", "Alex"));

    await ada.mutation(api.users.store, {});
    await ben.mutation(api.users.store, {});
    await admin.mutation(api.users.store, {});

    expect((await ada.query(api.users.me, {}))?.role).toBe("user");
    expect((await admin.query(api.users.me, {}))?.role).toBe("admin");

    const toolId = await ada.mutation(api.tools.create, {
      name: "Cordless drill",
      category: "power_tools",
      condition: "good",
      description: "Battery is charged.",
    });

    await expect(ben.mutation(api.tools.remove, { toolId })).rejects.toThrow(/own listings/);
    await expect(ben.mutation(api.tools.update, {
      toolId,
      name: "Stolen drill",
      category: "power_tools",
      condition: "fair",
      description: "Not yours.",
    })).rejects.toThrow(/own listings/);

    const adaProfile = await ada.query(api.users.me, {});
    await expect(
      ben.mutation(api.users.setTrustedLender, { userId: adaProfile!._id, trusted: true }),
    ).rejects.toThrow(/admin/i);
    await admin.mutation(api.users.setTrustedLender, { userId: adaProfile!._id, trusted: true });

    const listed = await t.query(api.tools.listPublic, {});
    expect(listed).toEqual([{ name: "Cordless drill", category: "power_tools" }]);
    expect(Object.keys(listed[0]).sort()).toEqual(["category", "name"]);

    await admin.mutation(api.tools.remove, { toolId });
    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
  });

  test("borrowers cannot approve, and strangers cannot close a loan", async () => {
    const t = convexTest(schema, modules);
    const ada = t.withIdentity(person("user_ada", "Ada"));
    const ben = t.withIdentity(person("user_ben", "Ben"));
    const stranger = t.withIdentity(person("user_stranger", "Sam"));
    await ada.mutation(api.users.store, {});
    await ben.mutation(api.users.store, {});
    await stranger.mutation(api.users.store, {});

    const toolId = await ada.mutation(api.tools.create, {
      name: "Camping stove",
      category: "camping",
      condition: "excellent",
      description: "Two burners.",
    });
    const startDate = utcToday();
    const endDate = new Date(Date.parse(`${startDate}T00:00:00.000Z`) + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    await expect(
      ada.mutation(api.loans.request, { toolId, startDate, endDate }),
    ).rejects.toThrow(/own tool/);

    const loanId = await ben.mutation(api.loans.request, { toolId, startDate, endDate });
    await expect(ben.mutation(api.loans.decide, { loanId, decision: "approved" })).rejects.toThrow(
      /lender/,
    );
    await expect(stranger.query(api.loans.all, {})).rejects.toThrow(/Admins only/);

    await ada.mutation(api.loans.decide, { loanId, decision: "approved" });
    await expect(stranger.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/own approved/);
    await ben.mutation(api.loans.markReturned, { loanId });
    const mine = await ben.query(api.loans.mine, {});
    expect(mine[0]?.status).toBe("returned");
  });
});

describe("signed reminder write-backs", () => {
  test("retries with the same key do not create a second reminder", async () => {
    const t = convexTest(schema, modules);
    const loanId = await t.run(async (ctx) => {
      const now = Date.now();
      const lenderId = await ctx.db.insert("users", {
        tokenIdentifier: "https://example.clerk.accounts.dev|user_ada",
        clerkId: "user_ada",
        name: "Ada",
        role: "user",
        trustedLender: false,
        createdAt: now,
      });
      const borrowerId = await ctx.db.insert("users", {
        tokenIdentifier: "https://example.clerk.accounts.dev|user_ben",
        clerkId: "user_ben",
        name: "Ben",
        role: "user",
        trustedLender: false,
        createdAt: now,
      });
      const toolId = await ctx.db.insert("tools", {
        ownerId: lenderId,
        name: "Hedge shears",
        category: "garden",
        condition: "good",
        description: "Oiled.",
        createdAt: now,
        updatedAt: now,
      });
      return await ctx.db.insert("loans", {
        toolId,
        toolName: "Hedge shears",
        category: "garden",
        borrowerId,
        lenderId,
        startDate: "2020-01-01",
        endDate: "2020-01-02",
        status: "approved",
        createdAt: now,
        updatedAt: now,
      });
    });

    const today = utcToday();
    const rawBody = canonicalize({
      daysOverdue: daysBetween("2020-01-02", today),
      idempotencyKey: `reminder:${loanId}:${today}`,
      loanId,
      outcome: "sent",
    });

    async function post(body: string, timestamp = Date.now().toString(), secret = SECRET) {
      const signature = await signBody(secret, timestamp, body);
      return await t.fetch("/reminders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lendloop-timestamp": timestamp,
          "x-lendloop-signature": signature,
        },
        body,
      });
    }

    const first = await post(rawBody);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ duplicate: false });

    const second = await post(rawBody);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });

    const signedAt = Date.now().toString();
    const signature = await signBody(SECRET, signedAt, rawBody);
    const tampered = await t.fetch("/reminders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lendloop-timestamp": signedAt,
        "x-lendloop-signature": signature,
      },
      body: rawBody.replace('"outcome":"sent"', '"outcome":"failed"'),
    });
    expect(tampered.status).toBe(401);

    const stale = await post(rawBody, String(Date.now() - 10 * 60 * 1000));
    expect(stale.status).toBe(401);

    const events = await t.run(async (ctx) => ctx.db.query("automationEvents").collect());
    expect(events.filter((event) => event.kind === "reminder_sent")).toHaveLength(1);

    const overdue = await post(canonicalize({}));
    expect(overdue.status).toBe(400);
    const badOverdue = await t.fetch("/overdue", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lendloop-timestamp": Date.now().toString(),
        "x-lendloop-signature": "ab".repeat(32),
      },
      body: "{}",
    });
    expect(badOverdue.status).toBe(401);

    const timestamp = Date.now().toString();
    const signedOverdue = await t.fetch("/overdue", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lendloop-timestamp": timestamp,
        "x-lendloop-signature": await signBody(SECRET, timestamp, "{}"),
      },
      body: "{}",
    });
    expect(signedOverdue.status).toBe(200);
    const payload = (await signedOverdue.json()) as {
      loans: Array<Record<string, unknown>>;
    };
    expect(Object.keys(payload.loans[0]).sort()).toEqual([
      "borrowerId",
      "daysOverdue",
      "endDate",
      "loanId",
      "toolName",
    ]);
  });

  test("refuses reminders when the signing secret is not configured", async () => {
    delete process.env.LENDLOOP_HMAC_SECRET;
    const t = convexTest(schema, modules);
    const response = await t.fetch("/reminders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(503);
  });
});
