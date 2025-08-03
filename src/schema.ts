/* tslint:disable:no-unused-variable */
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

/**
 * @description Schema for how we store the credentials of everyone
 *
 * Email and discord ids should only be unique.
 */
export const users = sqliteTable("users", {
    email: text("email", { length: 255 }).primaryKey().notNull(),
    discordId: text("discord_id", { length: 32 }).unique(),
    paymentStatus: integer("payment_status", { mode: "boolean" }).notNull().default(false),
    gryphLife: integer("in_gryphlife", { mode: "boolean" }).notNull().default(false),
    firstName: text("first_name", { length: 64 }),
    lastName: text("last_name", { length: 64 }),
});

export const verifying_users = sqliteTable("verifying_users", {
    email: text("email", { length: 255 }).notNull(),
    discordId: text("discord_id", { length: 32 }).primaryKey().notNull(),
    verificationCode: integer("verification_code").notNull().default(0),
    dateCreated: text("date_created")
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
});

export const countdown_channel = sqliteTable("countdown_channel", {
    channel_id: text("channel_id", { length: 48 }).primaryKey(),
    message_id: text("message_id"),
    messages_since: integer("messages_since").notNull().default(0),
});

export const countdown = sqliteTable("countdown", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    channel_id: text("channel_id", { length: 48 })
        .references(() => countdown_channel.channel_id)
        .notNull(),
    title: text("name").notNull(),
    link: text("link").default("https://shattereddisk.github.io/rickroll/rickroll.mp4"),
    expiration: text("end_time").notNull(),
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
