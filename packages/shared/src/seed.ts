import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const user = await prisma.user.upsert({
    where: { email: "demo@scheduler.dev" },
    update: {},
    create: { email: "demo@scheduler.dev", passwordHash, name: "Demo User" },
  });

  const org = await prisma.organization.create({
    data: { name: "Demo Org", ownerId: user.id },
  });

  await prisma.membership.create({
    data: { userId: user.id, orgId: org.id, role: "OWNER" },
  });

  const project = await prisma.project.create({
    data: { orgId: org.id, name: "Demo Project", apiKey: `pk_${Math.random().toString(36).slice(2)}` },
  });

  const retryPolicy = await prisma.retryPolicy.create({
    data: { name: "Default Exponential", strategy: "EXPONENTIAL", baseDelayMs: 1000, maxDelayMs: 60000, maxRetries: 5 },
  });

  const emailQueue = await prisma.queue.create({
    data: {
      projectId: project.id,
      name: "emails",
      priority: 5,
      concurrencyLimit: 10,
      retryPolicyId: retryPolicy.id,
    },
  });

  await prisma.queue.create({
    data: {
      projectId: project.id,
      name: "reports",
      priority: 1,
      concurrencyLimit: 2,
      retryPolicyId: retryPolicy.id,
    },
  });

  await prisma.job.create({
    data: {
      queueId: emailQueue.id,
      type: "send_welcome_email",
      payload: { to: "user@example.com" },
      kind: "IMMEDIATE",
    },
  });

  console.log("Seed complete. Demo login: demo@scheduler.dev / password123");
  console.log("Project API key:", project.apiKey);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
