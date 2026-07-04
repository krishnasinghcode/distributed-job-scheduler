import { prisma } from "@scheduler/shared";
import { ApiError } from "./apiError";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

const ROLE_RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

/**
 * Ensures the requesting user is a member of the org that owns `projectId`
 * with at least `minRole`. Throws ApiError (403/404) otherwise.
 * Returns the project row on success, so callers avoid a second query.
 */
export async function assertProjectAccess(userId: string, projectId: string, minRole: Role = "VIEWER") {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw ApiError.notFound("Project not found");

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId: project.orgId } },
  });
  if (!membership) throw ApiError.forbidden("You do not have access to this project");
  if (ROLE_RANK[membership.role as Role] < ROLE_RANK[minRole]) {
    throw ApiError.forbidden(`Requires ${minRole} role or higher`);
  }
  return project;
}
