import mongoose from "mongoose";
import { createApp } from "./app.js";
import { config } from "./config.js";

async function main() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.MONGODB_URI, { autoIndex: true, serverSelectionTimeoutMS: 15_000 });
  const server = createApp().listen(config.PORT, () => {
    console.log(`Capture Hub API listening on :${config.PORT}`);
    console.log(`Allowed browser origins (CORS_ORIGINS): ${config.corsOrigins.join(", ") || "(none)"}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Failed to start", err);
  process.exit(1);
});
