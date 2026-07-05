import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Mock the shared Prisma client so these tests run without a live database.
// This keeps "npm test" fast and CI-friendly; full DB-backed flows are
// covered separately by the integration suite documented in docs/API.md.
vi.mock("@scheduler/shared", async () => {
  const actual = await vi.importActual<typeof import("@scheduler/shared")>("@scheduler/shared");
  return {
    ...actual,
    prisma: {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      organization: { create: vi.fn() },
      membership: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

import { createApp } from "../src/app";
import { prisma } from "@scheduler/shared";

const app = createApp();

describe("POST /api/auth/register", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid email with 400", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "not-an-email",
      password: "password123",
      name: "Test",
      orgName: "Org",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects short password with 400", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "a@b.com",
      password: "short",
      name: "Test",
      orgName: "Org",
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 when email already registered", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u1", email: "a@b.com" });
    const res = await request(app).post("/api/auth/register").send({
      email: "a@b.com",
      password: "password123",
      name: "Test",
      orgName: "Org",
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unknown email", async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    const res = await request(app).post("/api/auth/login").send({ email: "nobody@x.com", password: "whatever" });
    expect(res.status).toBe(401);
  });
});

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
