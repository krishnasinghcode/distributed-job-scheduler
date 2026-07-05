import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "../api/client";

export interface WsEvent {
  type: "job.updated" | "worker.heartbeat" | "queue.stats";
  [key: string]: unknown;
}

export function useLiveEvents(projectId: string | undefined, onEvent: (evt: WsEvent) => void) {
  const socketRef = useRef<Socket>();
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    if (projectId) socket.emit("subscribe:project", projectId);
    socket.on("event", (evt: WsEvent) => handlerRef.current(evt));

    return () => {
      socket.disconnect();
    };
  }, [projectId]);
}
