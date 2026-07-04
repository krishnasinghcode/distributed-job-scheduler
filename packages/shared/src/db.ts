import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Lazy initialization to avoid side-effects at import time
// Required for test mocking and tooling without a live database
function getClient(): PrismaClient {
  if (!global.__prisma) {
    global.__prisma = createClient();
  }
  return global.__prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

export * from "@prisma/client";