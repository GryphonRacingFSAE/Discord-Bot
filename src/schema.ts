/* tslint:disable:no-unused-variable */
import { mysqlTable, text, boolean, int, datetime, varchar } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const users = mysqlTable("users", {
    email: varchar("email", { length: 255 }).primaryKey().notNull(),
    discordId: varchar("discord_id", { length: 32 }).notNull().default("").unique(),
    paymentStatus: boolean("payment_status").notNull().default(false),
    gryphLife: boolean("in_gryphlife").notNull().default(false),
});

export const verifying_users = mysqlTable("verifying_users", {
    email: varchar("email", { length: 255 }).notNull(),
    discordId: varchar("discord_id", { length: 32 }).primaryKey().notNull(),
    verificationCode: int("verification_code").notNull().default(0),
    dateCreated: datetime("date_created")
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type VerifyingUser = typeof verifying_users.$inferSelect;
export type NewVerifyingUser = typeof verifying_users.$inferInsert;
