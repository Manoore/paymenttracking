import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach } from "vitest";

let mongo: MongoMemoryServer;

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-test-access-secret-0123";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-test-refresh-secret-0123";
process.env.CRON_SECRET = "cron-secret";
process.env.MONGODB_URI = "mongodb://placeholder";

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

beforeEach(async () => {
  const db = mongoose.connection.db!;
  for (const c of await db.collections()) await c.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
