import { describe, expect, test } from "vitest";
import {
  canAssignRole,
  canCancelRequest,
  canDecideRequest,
  canDeleteListing,
  canEditListing,
  canMarkReturned,
  canMarkTrustedLender,
  canRequestBorrow,
  canViewAllLoans,
  canViewLoan,
  type Actor,
} from "../convex/lib/rbac";

const ada: Actor = { userId: "ada", role: "user" };
const ben: Actor = { userId: "ben", role: "user" };
const admin: Actor = { userId: "admin", role: "admin" };
const stranger: Actor = { userId: "stranger", role: "user" };
const tool = { ownerId: "ada" };
const pending = { borrowerId: "ben", lenderId: "ada", status: "pending" };
const approved = { borrowerId: "ben", lenderId: "ada", status: "approved" };
const returned = { borrowerId: "ben", lenderId: "ada", status: "returned" };

describe("listing rules", () => {
  test("owners edit and delete their own listings", () => {
    expect(canEditListing(ada, tool)).toBe(true);
    expect(canDeleteListing(ada, tool)).toBe(true);
  });

  test("other users cannot edit or delete a listing", () => {
    expect(canEditListing(ben, tool)).toBe(false);
    expect(canDeleteListing(ben, tool)).toBe(false);
    expect(canEditListing(null, tool)).toBe(false);
  });

  test("admins can remove any listing and cannot rewrite it", () => {
    expect(canDeleteListing(admin, tool)).toBe(true);
    expect(canEditListing(admin, tool)).toBe(false);
  });

  test("nobody assigns roles through the product API", () => {
    expect(canAssignRole()).toBe(false);
  });
});

describe("loan rules", () => {
  test("a neighbor can request someone else's tool, not their own", () => {
    expect(canRequestBorrow(ben, tool)).toBe(true);
    expect(canRequestBorrow(ada, tool)).toBe(false);
    expect(canRequestBorrow(null, tool)).toBe(false);
  });

  test("only the lender decides a pending request", () => {
    expect(canDecideRequest(ada, pending)).toBe(true);
    expect(canDecideRequest(ben, pending)).toBe(false);
    expect(canDecideRequest(admin, pending)).toBe(false);
    expect(canDecideRequest(ada, approved)).toBe(false);
  });

  test("the borrower can cancel their own pending request", () => {
    expect(canCancelRequest(ben, pending)).toBe(true);
    expect(canCancelRequest(ada, pending)).toBe(false);
    expect(canCancelRequest(ben, approved)).toBe(false);
  });

  test("return is limited to the two parties and admins, and only while approved", () => {
    expect(canMarkReturned(ada, approved)).toBe(true);
    expect(canMarkReturned(ben, approved)).toBe(true);
    expect(canMarkReturned(admin, approved)).toBe(false);
    expect(canMarkReturned(stranger, approved)).toBe(false);
    expect(canMarkReturned(ada, returned)).toBe(false);
    expect(canMarkReturned(null, approved)).toBe(false);
  });

  test("loan visibility follows the parties, except admins see every loan", () => {
    expect(canViewLoan(ada, pending)).toBe(true);
    expect(canViewLoan(ben, pending)).toBe(true);
    expect(canViewLoan(stranger, pending)).toBe(false);
    expect(canViewLoan(admin, pending)).toBe(true);
    expect(canViewAllLoans(admin)).toBe(true);
    expect(canViewAllLoans(ada)).toBe(false);
    expect(canViewAllLoans(null)).toBe(false);
  });

  test("only admins mark a trusted lender", () => {
    expect(canMarkTrustedLender(admin)).toBe(true);
    expect(canMarkTrustedLender(ada)).toBe(false);
    expect(canMarkTrustedLender(null)).toBe(false);
  });
});
