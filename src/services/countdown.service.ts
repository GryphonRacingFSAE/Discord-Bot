/**
 * @description Responsible for handling countdowns in the server.
 */
import { Command, OnMessageCreate, OnReady, Service } from "@/service.js";
import { APIEmbedField, ChannelType, EmbedBuilder, Events, Guild, MessageType, SlashCommandBuilder, TextChannel } from "discord.js";
import { db } from "@/db.js";
import * as schema from "@/schema.js";
import { countdown } from "@/schema.js";
import { and, eq, sql } from "drizzle-orm";
import cron from "node-cron";
import { DiscordClient } from "@/discord-client";
import { format_embed, quick_embed } from "@/util.js";
import { channel } from "node:diagnostics_channel";

const COMMAND_UPDATE = 5; // Time in minutes in which we should refresh each countdown
const NEW_COUNTDOWN_MESSAGE = 24 * 60 * 60 * 1000; // Time in millisecond we should wait before having another countdown
const MAX_MESSAGES_NEW_MESSAGE = 100; // [0, 100] - # of messages before a new one must be sent

const get_channel_by_id =
    db !== undefined ? db.query.countdown_channel.findFirst({ with: { countdowns: true }, where: eq(schema.countdown_channel.channel_id, sql.placeholder("channel_id")) }).prepare() : undefined;

async function get_countdown_embed(channel: schema.ChannelCountdown & { countdowns: schema.Countdown[] }): Promise<EmbedBuilder> {
    const footers: APIEmbedField[] = channel.countdowns.map(countdown => {
        const expiration_date = new Date(countdown.expiration);
        const expiration = expiration_date.toLocaleDateString(`en-CA`, {
            year: `numeric`,
            month: `long`,
            day: `numeric`,
        });
        if (new Date().getMilliseconds() - expiration_date.getMilliseconds() <= 0) {
            return {
                name: `${countdown.title}`,
                value: `[${expiration}](${countdown.link || schema.countdown.link.default})\nDone.`,
            };
        }
        let time_left: string = "";
        const delta_time = new Date(countdown.expiration).getTime() - new Date().getTime();
        const delta_seconds = delta_time / 1000;
        const delta_minutes = delta_seconds / 60;
        const delta_hours = delta_minutes / 60;
        const delta_days = delta_hours / 24;
        const delta_weeks = delta_days / 7;
        const delta_months = delta_days / 30;

        if (delta_months > 2) {
            time_left = Math.round(delta_months) + " month(s)";
        } else if (delta_weeks > 2) {
            time_left = Math.round(delta_weeks) + " week(s)";
        } else if (delta_days > 3) {
            time_left = Math.round(delta_days * 10) / 10 + " day(s)";
        } else {
            time_left = Math.round(delta_hours * 1000) / 1000 + " hour(s)";
        }
        return {
            name: `${countdown.title}`,
            value: `[${expiration}](${countdown.link || schema.countdown.link.default})\nTime remaining: ${time_left}`,
        };
    });
    return format_embed(new EmbedBuilder().setTimestamp().setFields(footers), "yellow");
}

/**
 * @description Updates an individual channel's countdowns
 */
export async function update_countdown(channel: schema.ChannelCountdown & { countdowns: schema.Countdown[] }, guild: Guild, force_new_message?: boolean) {
    if (!guild.channels.cache.has(channel.channel_id)) return Promise.reject("No channel");
    const discord_channel = guild.channels.cache.get(channel.channel_id);
    if (discord_channel === undefined) return Promise.reject("No channel found");
    const text_channel = discord_channel as TextChannel;
    const message = channel.message_id !== null ? (await text_channel.messages.fetch({ limit: 100 })).get(channel.message_id) : undefined;
    if (!guild.channels.cache.has(channel.channel_id)) return Promise.reject("No channel");

    const delta_time = new Date().getTime() - (message !== undefined ? message.createdTimestamp : 0);
    // If message exists < 24 hours, edit if not make new lol
    if (message === undefined || delta_time > NEW_COUNTDOWN_MESSAGE || force_new_message === true) {
        if (message !== undefined) {
            // eslint-disable-next-line drizzle/enforce-delete-with-where
            await message.delete().then(_ => db?.update(schema.countdown_channel).set({ messages_since: 0 }).where(eq(schema.countdown_channel.channel_id, message.channelId)).execute());
        } else if (channel.message_id !== null) {
            console.error(`Could not find the countdown message id: ${channel.message_id}`);
        }
        return get_countdown_embed(channel).then(embedded =>
            text_channel
                .send({
                    embeds: [embedded],
                })
                .then(async message => {
                    try {
                        await message.pin();
                    } catch {
                        /* empty */
                    }
                    return message;
                })
                .then(message => {
                    return db!
                        .update(schema.countdown_channel)
                        .set({
                            message_id: message.id,
                        })
                        .where(eq(schema.countdown_channel.channel_id, channel.channel_id));
                }),
        );
    } else if (delta_time <= NEW_COUNTDOWN_MESSAGE) {
        return get_countdown_embed(channel).then(embedded =>
            message.edit({
                embeds: [embedded],
            }),
        );
    }
}

/**
 * @description Updates every countdown at once
 */
export async function update_countdowns(client: DiscordClient) {
    if (db === undefined) return Promise.reject("No db");
    const expire_time = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID!);
    if (guild === undefined) return Promise.reject("No guild id");
    // delete outdated countdowns
    return db
        .delete(schema.countdown)
        .where(sql`${countdown.expiration} < ${expire_time}`)
        .execute()
        .then(async _ => {
            const results = await db!.query.countdown_channel
                .findMany({
                    with: {
                        countdowns: true,
                    },
                })
                .execute();
            return await Promise.all(results.map(channel => update_countdown(channel, guild)));
        });
}

/**
 * @description Handles adding countdowns
 */
export async function add_countdown(countdown: schema.Countdown, channel_id: string) {
    return db!.query.countdown_channel
        .findFirst({ where: eq(schema.countdown_channel.channel_id, channel_id) })
        .then(async result => {
            if (result === undefined) {
                return db!.insert(schema.countdown_channel).values({
                    channel_id: channel_id,
                });
            }
        })
        .then(async _ => {
            return db!.insert(schema.countdown).values(countdown).execute();
        });
}

const on_ready = {
    run_on: [Events.ClientReady],
    once: true,
    validate: () => {
        return Promise.resolve(db !== undefined && process.env.DISCORD_GUILD_ID !== undefined);
    },
    execution: async (_, client, __) => {
        cron.schedule(`*/${COMMAND_UPDATE} * * * *`, async _ => {
            return update_countdowns(client);
        });
    },
} satisfies OnReady;

const handle_new_countdowns: Map<string, boolean> = new Map(); // We need to create a "lock" on creating new countdowns

/**
 * @description Responsible for resending any countdown messages as discord only lets us fetch at most 100 messages at once.
 */
const on_message_create = {
    run_on: [Events.MessageCreate, Events.MessageDelete],
    once: false,
    validate: () => {
        return Promise.resolve(db !== undefined && process.env.DISCORD_GUILD_ID !== undefined);
    },
    execution: async (event, client, __, message) => {
        const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID!) as Guild;
        if (message.channel.type !== ChannelType.GuildText) return;
        // eslint-disable-next-line drizzle/enforce-update-with-where
        return db
            ?.update(schema.countdown_channel)
            .set({ messages_since: event === Events.MessageCreate ? sql`${schema.countdown_channel.messages_since} + 1` : sql`max(${schema.countdown_channel.messages_since} - 1, 0)` })
            .where(eq(schema.countdown_channel.channel_id, message.channelId))
            .execute()
            .then(
                _ =>
                    db?.query.countdown_channel
                        .findFirst({ with: { countdowns: true }, where: eq(schema.countdown_channel.channel_id, message.channelId) })
                        .execute()
                        .then(channel => {
                            // Cap message_since at 100 since we can fetch at most 100 messages this ensures
                            // we constantly update the bot.
                            if (
                                channel !== undefined &&
                                (channel.messages_since >= Math.max(MAX_MESSAGES_NEW_MESSAGE, 3) || channel.messages_since >= 100) &&
                                handle_new_countdowns.get(message.channelId) === false
                            ) {
                                handle_new_countdowns.set(message.channelId, true);
                                return update_countdown(channel, guild, true);
                            } else {
                                return undefined;
                            }
                        }),
            )
            .then(_ => {
                handle_new_countdowns.set(message.channelId, false);
            });
    },
} satisfies OnMessageCreate;

const countdown_command = {
    data: new SlashCommandBuilder()
        .setName("countdown")
        .setDescription("Commands regarding a countdown")
        .addSubcommand(sub_command =>
            sub_command
                .setName("add")
                .setDescription("Start the countdown!")
                .addStringOption(option => option.setName("date").setDescription("Date of the event in YYYY/MM/DD format").setRequired(true))
                .addStringOption(option => option.setName("name").setDescription("Name of the event").setRequired(true))
                .addStringOption(option => option.setName("url").setDescription("Optional URL of the event").setRequired(false)),
        )
        .addSubcommand(sub_command =>
            sub_command
                .setName("remove")
                .setDescription("Remove a countdown!")
                .addStringOption(option => option.setName("name").setDescription("Name of the event").setRequired(true)),
        )
        .addSubcommand(sub_command => sub_command.setName("update").setDescription("Updates the current channel's events")) as SlashCommandBuilder,
    execution: async (client, interaction) => {
        if (!interaction.isChatInputCommand()) return;
        if (db === undefined) return;
        const options = interaction.options;
        switch (options.getSubcommand()) {
            case "add": {
                const date_string = options.get("date")?.value?.toString();
                const event_title = options.get("name")?.value?.toString();
                const event_link = options.get("url")?.value?.toString();
                if (date_string === undefined && event_title === undefined) return;

                const match = date_string?.match(new RegExp("^([0-9]{4})/([0-9]{2})/([0-9]{2})$"));
                if (match === null) {
                    await interaction
                        .reply({
                            content: "Invalid date format. Please use YYYY/MM/DD format",
                            ephemeral: true,
                        })
                        .then(_ => {});
                }
                const [year, month, day] = [match![1], match![2], match![3]];
                const date = new Date(Number(year), Number(month) - 1, Number(day));
                if (date.getTime() - Date.now() <= 0) {
                    // All countdowns must be in the future
                    return interaction
                        .reply({
                            content: "Date specified should be in the future",
                            ephemeral: true,
                        })
                        .then(_ => {});
                }
                return add_countdown(
                    {
                        title: event_title!,
                        link: event_link || schema.countdown.link.default,
                        expiration: date,
                        channel_id: interaction.channelId,
                    } as schema.Countdown,
                    interaction.channelId,
                )
                    .then(_ => get_channel_by_id?.execute({ channel_id: interaction.channelId }))
                    .then(channel => update_countdown(channel!, interaction.guild!))
                    .then(_ =>
                        interaction.reply({
                            ephemeral: true,
                            embeds: [quick_embed("Success", "Created a countdown.", "yellow")],
                        }),
                    )
                    .then(_ => {});
            }
            case "remove": {
                const event_name = options.get("name")?.value?.toString();
                if (event_name === undefined) return;
                return db
                    .delete(schema.countdown)
                    .where(and(eq(schema.countdown.channel_id, interaction.channelId), eq(schema.countdown.title, event_name)))
                    .execute()
                    .then(_ => {
                        return interaction.reply({
                            ephemeral: true,
                            embeds: [quick_embed("Success", "Deleted events in channel", "yellow")],
                        });
                    })
                    .then(async _ => update_countdown((await get_channel_by_id?.execute({ channel_id: interaction.channelId }))!, interaction.guild as Guild))
                    .then(_ => {});
            }
            case "update": {
                return get_channel_by_id
                    ?.execute({ channel_id: interaction.channelId })
                    .then(async channel => {
                        if (!channel) {
                            return interaction.reply({
                                ephemeral: true,
                                embeds: [quick_embed("Failure", "Channel does not contain any countdowns", "red")],
                            });
                        }
                        return update_countdown(channel, interaction.guild!);
                    })
                    .then(_ =>
                        interaction.reply({
                            ephemeral: true,
                            embeds: [quick_embed("Success", "Refreshed countdowns in channel.", "yellow")],
                        }),
                    )
                    .then(_ => {});
            }
        }
        return;
    },
    validate: () => Promise.resolve(true),
} satisfies Command;

const service = {
    name: "countdown",
    validate: () => {
        return Promise.resolve(true);
    },
    commands: [countdown_command],
    events: [on_ready, on_message_create],
} satisfies Service;

export default service;
