import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { authRouter } from "./routes/auth.routes";
import { projectRouter } from "./routes/project.routes";
import { queueRouter } from "./routes/queue.routes";
import { jobRouter } from "./routes/job.routes";
import { workerRouter } from "./routes/worker.routes";
import { internalRouter } from "./routes/internal.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(process.env.NODE_ENV === "test" ? "silent" : "dev"));

  app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

  app.use("/api/auth", authRouter);
  app.use("/api/projects", projectRouter);
  app.use("/api/queues", queueRouter);
  app.use("/api/jobs", jobRouter);
  app.use("/api/workers", workerRouter);
  app.use("/internal", internalRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
