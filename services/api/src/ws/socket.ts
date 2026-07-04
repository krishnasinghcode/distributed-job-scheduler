import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { redis } from "../lib/redis";
import type { WsEvent } from "@scheduler/shared";

let io: SocketIOServer | undefined;

export function initSocket(httpServer: HttpServer) {
  io = new SocketIOServer(httpServer, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    socket.on("subscribe:project", (projectId: string) => {
      socket.join(`project:${projectId}`);
    });
  });

  // Worker/scheduler processes publish events to Redis pub/sub; the API
  // process (which owns the socket.io connections) relays them to browsers.
  // This decouples "who emits an event" from "who holds the websocket".
  const sub = redis.duplicate();
  sub.subscribe("ws-events");
  sub.on("message", (_channel, message) => {
    try {
      const evt = JSON.parse(message) as WsEvent & { projectId: string };
      // Worker/scheduler processes emit job/worker events without knowing
      // the owning project (avoids a DB join on every status transition).
      // Broadcast those to all connected dashboards; the frontend filters
      // by the queueId it's currently viewing.
      if (evt.projectId === "__broadcast__") {
        io?.emit("event", evt);
      } else {
        io?.to(`project:${evt.projectId}`).emit("event", evt);
      }
    } catch {
      /* ignore malformed message */
    }
  });

  return io;
}

export async function publishEvent(projectId: string, event: WsEvent) {
  await redis.publish("ws-events", JSON.stringify({ ...event, projectId }));
}
