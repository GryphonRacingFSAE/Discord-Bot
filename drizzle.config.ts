import * as dotenv from "dotenv";
dotenv.config();
import { Config, defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/schema.ts",
    out: "./drizzle",
    dialect: "sqlite",
    dbCredentials: {
        url: "./database.sqlite",
    },
}) satisfies Config;
