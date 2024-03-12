import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
//import { schema } from "drizzle-kit/serializer/mysqlSchema";
import * as schema from "@/schema.js";
import { sql } from "drizzle-orm";

let db: MySql2Database<typeof schema> | undefined = undefined;

if (
    process.env.MYSQL_HOST !== undefined &&
    process.env.MYSQL_USER !== undefined &&
    process.env.MYSQL_PASSWORD !== undefined &&
    process.env.MYSQL_DATABASE !== undefined &&
    process.env.MYSQL_PORT !== undefined &&
    process.env.DEPLOY !== "1"
) {
    try {
        const connection = await mysql.createConnection({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE,
            port: Number(process.env.MYSQL_PORT),
            multipleStatements: true,
        });
        db = drizzle(connection, { mode: "default", schema });
        console.log("Loaded db!");
    } catch {
        console.log("Failed to load db");
    }
} else {
    console.warn("No db loaded!");
}

export { db };
