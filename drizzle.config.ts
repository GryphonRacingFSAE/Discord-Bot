import * as dotenv from "dotenv";
dotenv.config();
import { Config, defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/schema.ts",
    out: "./drizzle",
    driver: "mysql2",
    dbCredentials: {
        host: process.env.MYSQL_HOST!,
        port: Number(process.env.MYSQL_PORT),
        user: process.env.MYSQL_USER!,
        password: process.env.MYSQL_PASSWORD!,
        database: process.env.MYSQL_DATABASE!,
    },
}) satisfies Config;
