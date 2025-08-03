import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client/node";
import * as schema from "@/schema.ts";

let db: ReturnType<typeof drizzle<typeof schema>> | undefined = undefined;

try {
    console.log("Attempting to connect to SQLite database...");
        
    const databasePath = Deno.env.get("DATABASE_PATH") || "./database.sqlite";
    console.log(`Database path: ${databasePath}`);

    // Use @libsql/client Node.js version with proper file:// URL format
    const client = createClient({ url: `file:${databasePath}` });
    db = drizzle(client, { schema });

    console.log("Loaded SQLite db!");
} catch (error) {
    console.error("Failed to load db:", error);
}

export { db };
