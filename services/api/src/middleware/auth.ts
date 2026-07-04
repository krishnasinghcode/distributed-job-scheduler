import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../lib/apiError";
import type { JwtPayload } from "@scheduler/shared";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Missing bearer token"));
  }
  const token = header.slice("Bearer ".length);
  try {
    req.user = jwt.verify(token, JWT_SECRET) as JwtPayload;
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired token"));
  }
}

// Alternative auth path for machine-to-machine job submission: a project's
// API key, sent as `X-API-Key`. Resolved to the project in the route/controller.
export function getApiKeyFromRequest(req: Request): string | undefined {
  const key = req.headers["x-api-key"];
  return typeof key === "string" ? key : undefined;
}
