import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@scheduler/shared";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { assertProjectAccess } from "../lib/rbac";
import { ApiError } from "../lib/apiError";

export const projectRouter = Router();
projectRouter.use(requireAuth);

// List projects across every org the user belongs to.
projectRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.user!.userId },
      select: { orgId: true },
    });
    const projects = await prisma.project.findMany({
      where: { orgId: { in: memberships.map((m: { orgId: string }) => m.orgId) } },
      include: { _count: { select: { queues: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: projects });
  })
);

const createProjectSchema = z.object({ orgId: z.string().uuid(), name: z.string().min(1) });

projectRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createProjectSchema.parse(req.body);
    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: req.user!.userId, orgId: body.orgId } },
    });
    if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
      throw ApiError.forbidden("Requires ADMIN role or higher in this organization");
    }
    const project = await prisma.project.create({
      data: { orgId: body.orgId, name: body.name, apiKey: `pk_${randomBytes(16).toString("hex")}` },
    });
    res.status(201).json({ data: project });
  })
);

projectRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await assertProjectAccess(req.user!.userId, req.params.id, "VIEWER");
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { queues: true },
    });
    res.json({ data: project });
  })
);

// Rotate a project's API key (used by external systems to submit jobs).
projectRouter.post(
  "/:id/rotate-key",
  asyncHandler(async (req, res) => {
    await assertProjectAccess(req.user!.userId, req.params.id, "ADMIN");
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { apiKey: `pk_${randomBytes(16).toString("hex")}` },
    });
    res.json({ data: { apiKey: project.apiKey } });
  })
);
