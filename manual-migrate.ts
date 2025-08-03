import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";

// Use the same database path logic as the main app
const databasePath = path.resolve(Deno.cwd(), "./database.sqlite");

// Create client using the same format as the app
const client = createClient({
  url: `file:${databasePath}`
});

const db = drizzle(client);

console.log("Running manual migrations...");
try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations completed successfully!");
} catch (error) {
  console.error("Migration failed:", error);
  Deno.exit(1);
}

client.close();
