import { createServer } from "http";
import { createApp } from "./app";
import { initSocket } from "./ws/socket";

const PORT = Number(process.env.PORT) || 4000;

const app = createApp();
const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${PORT}`);
});

process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
});
