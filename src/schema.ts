/* tslint:disable:no-unused-variable */
import { mysqlTable, text, boolean, int, datetime, varchar, serial, date } from "drizzle-orm/mysql-core";
import { relations, sql } from "drizzle-orm";

/**
 * @description Schema for how we store the credentials of everyone
 *
 * Email and discord ids should only be unique.
 */
export const users = mysqlTable("users", {
    email: varchar("email", { length: 255 }).primaryKey().notNull(),
    discordId: varchar("discord_id", { length: 32 }).unique(),
    paymentStatus: boolean("payment_status").notNull().default(false),
    gryphLife: boolean("in_gryphlife").notNull().default(false),
    firstName: varchar("first_name", { length: 64 }),
    lastName: varchar("last_name", { length: 64 }),
});

export const verifying_users = mysqlTable("verifying_users", {
    email: varchar("email", { length: 255 }).notNull(),
    discordId: varchar("discord_id", { length: 32 }).primaryKey().notNull(),
    verificationCode: int("verification_code").notNull().default(0),
    dateCreated: datetime("date_created")
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
});

export const countdown_channel = mysqlTable("countdown_channel", {
    channel_id: varchar("channel_id", { length: 48 }).primaryKey(),
    message_id: text("message_id"),
    messages_since: int("messages_since").notNull().default(0),
});

export const countdown = mysqlTable("countdown", {
    id: serial("id").primaryKey(),
    channel_id: varchar("channel_id", { length: 48 })
        .references(() => countdown_channel.channel_id)
        .notNull(),
    title: text("name").notNull(),
    link: text("link").default("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    expiration: datetime("end_time").notNull(),
});

export const ChannelRelations = relations(countdown_channel, ({ many }) => ({
    countdowns: many(countdown),
}));

export const CountdownRelations = relations(countdown, ({ one }) => ({
    channel: one(countdown_channel, { fields: [countdown.channel_id], references: [countdown_channel.channel_id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type VerifyingUser = typeof verifying_users.$inferSelect;
export type NewVerifyingUser = typeof verifying_users.$inferInsert;

export type Countdown = typeof countdown.$inferSelect;
export type NewCountdown = typeof countdown.$inferInsert;

export type ChannelCountdown = typeof countdown_channel.$inferSelect;
export type NewChannelCountdown = typeof countdown_channel.$inferInsert;
