import { createApp } from "./app";
import { env } from "./config/env";
import { pool } from "./db/pool";

const server = createApp().listen(env.PORT, () => {
  console.log(`API MAVI ouvindo na porta ${env.PORT}`);
});

function shutdown() {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
