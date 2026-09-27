// Local MongoDB for development without Docker/Atlas. Data persists in backend/.devdb.
import { mkdirSync } from "node:fs";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const dbPath = new URL("../.devdb", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
mkdirSync(dbPath, { recursive: true });
const rs = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  instanceOpts: [{ port: 27017, dbPath, storageEngine: "wiredTiger" }],
});
console.log(`Dev MongoDB (replica set) at ${rs.getUri("capturehub")}`);
const stop = async () => { await rs.stop({ doCleanup: false }); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
