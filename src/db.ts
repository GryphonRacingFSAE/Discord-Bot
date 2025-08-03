import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client/node";
import * as schema from "@/schema.ts";

let db: ReturnType<typeof drizzle<typeof schema>> | undefined = undefined;

try {
    const databasePath = Deno.env.get("DATABASE_PATH") || "./database.sqlite";

    // Use @libsql/client Node.js version with proper file:// URL format
    const client = createClient({ url: `file:${databasePath}` });
    db = drizzle(client, { schema });

    console.log("Database loaded successfully!");
} catch (error) {
    console.error("Failed to load database:", error);
}

export { db };
