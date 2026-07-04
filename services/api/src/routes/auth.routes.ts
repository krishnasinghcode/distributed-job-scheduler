import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma, Prisma } from "@scheduler/shared";
import { asyncHandler } from "../middleware/errorHandler";
import { ApiError } from "../lib/apiError";
import { signToken } from "../middleware/auth";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  orgName: z.string().min(1),
});

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw ApiError.conflict("Email already registered");

    const passwordHash = await bcrypt.hash(body.password, 10);

    // Create user + org + owner membership atomically.
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: { email: body.email, passwordHash, name: body.name },
      });
      const org = await tx.organization.create({
        data: { name: body.orgName, ownerId: user.id },
      });
      await tx.membership.create({
        data: { userId: user.id, orgId: org.id, role: "OWNER" },
      });
      return { user, org };
    });

    const token = signToken({ userId: result.user.id, email: result.user.email });
    res.status(201).json({ token, user: { id: result.user.id, email: result.user.email, name: result.user.name }, organization: result.org });
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw ApiError.unauthorized("Invalid credentials");

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) throw ApiError.unauthorized("Invalid credentials");

    const token = signToken({ userId: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  })
);
