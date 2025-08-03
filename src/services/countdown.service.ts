/**
 * @description Responsible for handling countdowns in the server.
 */
import { Command, OnMessageCreate, OnReady, Service } from "@/service.ts";
import { APIEmbedField, ChannelType, EmbedBuilder, Events, Guild, GuildMember, Message, MessageFlags, MessageType, SlashCommandBuilder, TextChannel } from "discord.js";
import { db } from "@/db.ts";
import * as schema from "@/schema.ts";
import { countdown } from "@/schema.ts";
import { and, eq, sql } from "drizzle-orm";
import cron from "node-cron";
import { DiscordClient } from "@/discord-client.ts";
import { format_embed, quick_embed } from "@/util.ts";
import { member_has_permission_or } from "@/permissions.ts";

const COMMAND_UPDATE = 5; // Time in minutes in which we should refresh each countdown
const NEW_COUNTDOWN_MESSAGE = 24 * 60 * 60 * 1000; // Time in millisecond we should wait before having another countdown
const MAX_MESSAGES_NEW_MESSAGE = 100; // [0, 100] - # of messages before a new one must be sent

const get_channel_by_id =
    db !== undefined ? db.query.countdown_channel.findFirst({ with: { countdowns: true }, where: eq(schema.countdown_channel.channel_id, sql.placeholder("channel_id")) }).prepare() : undefined;

function get_countdown_embed(channel: schema.ChannelCountdown & { countdowns: schema.Countdown[] }): EmbedBuilder {
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
 * @description Try to delete the annoying ___ has pinned message.
 */
function delete_pinned_message(discord_channel: TextChannel) {
    return discord_channel.messages.fetch({ limit: 10 }).then(messages => {
        const pinned = messages.find(message => message.type === MessageType.ChannelPinnedMessage && message.system);
        if (pinned !== undefined) {
            // eslint-disable-next-line drizzle/enforce-delete-with-where
            return pinned.delete();
        }
    });
}

/**
 * @description A simple cache for message ids, so we don't need to spam db calls
 */
const message_id_cache: Map<string, Message> = new Map();

/**
 * @description Grabs the countdown message id by channel id using the cache primarily and **does not update the cache if it already exists.**
 * Reason for not updating as we're only mainly concerned about the order of message ids.
 * @param client
 * @param channel_id
 */
function get_message_by_channel_id(client: DiscordClient, channel_id: string): Promise<Message | undefined> {
    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID!);
    if (guild === undefined || db === undefined) return Promise.resolve(undefined);
    const channel = guild.channels.cache.get(channel_id);
    if (channel === undefined || channel.type !== ChannelType.GuildText) return Promise.resolve(undefined);
    return db.query.countdown_channel
        .findFirst({ where: eq(schema.countdown_channel.channel_id, channel_id) })
        .execute()
        .then(result => {
            if (result !== undefined && result.message_id !== null) {
                const message = channel.messages.cache.get(result.message_id as string);
                if (message) message_id_cache.set(channel_id, message);
                return message;
            }
        });
}

/**
 * @description Updates an individual channel's countdowns
 */
export async function update_countdown(channel: schema.ChannelCountdown & { countdowns: schema.Countdown[] }, guild: Guild, force_new_message?: boolean) {
    if (!guild.channels.cache.has(channel.channel_id)) return Promise.reject("No channel");
    const discord_channel = guild.channels.cache.get(channel.channel_id);
    if (discord_channel === undefined || discord_channel.type !== ChannelType.GuildText) return Promise.reject("No correct channel found");
    const text_channel = discord_channel;
    
    // Safely fetch the message with error handling
    let message: Message | undefined = undefined;
    if (channel.message_id !== null) {
        try {
            message = await text_channel.messages.fetch(channel.message_id);
        } catch (error) {
            // Message doesn't exist anymore, clear the message_id in database
            console.warn(`Countdown message ${channel.message_id} not found, clearing from database`);
            await db?.update(schema.countdown_channel)
                .set({ message_id: null, messages_since: 0 })
                .where(eq(schema.countdown_channel.channel_id, channel.channel_id))
                .execute();
            message = undefined;
        }
    }

    const delta_time = new Date().getTime() - (message !== undefined ? message.createdTimestamp : 0);
    // If message exists < 24 hours, edit if not make new lol
    if (message === undefined || delta_time > NEW_COUNTDOWN_MESSAGE || force_new_message === true || (channel.countdowns.length === 0 && message)) {
        if (message !== undefined && channel.countdowns.length === 0) {
            // eslint-disable-next-line drizzle/enforce-delete-with-where
            try {
                return await message.delete().then(_ => db?.update(schema.countdown_channel).set({ messages_since: 0 }).where(eq(schema.countdown_channel.channel_id, message.channelId)).execute());
            } catch (_) {
                // Continue with creating new message even if delete failed
            }
        } else if (message !== undefined) {
            // eslint-disable-next-line drizzle/enforce-delete-with-where
            try {
                await message.delete().then(_ => db?.update(schema.countdown_channel).set({ messages_since: 0 }).where(eq(schema.countdown_channel.channel_id, message.channelId)).execute());
            } catch (_) {
                // Continue with creating new message even if delete failed
            }
        } else if (channel.message_id !== null) {
            console.error(`Could not find the countdown message id: ${channel.message_id}`);
        }
        return text_channel
            .send({
                embeds: [get_countdown_embed(channel)],
            })
            .then(async message => {
                try {
                        await message.pin().then(_ => delete_pinned_message(text_channel));
                    } catch {
                        /* empty */
                    }
                    return message;
                })
                .then(message => {
                    // update cache
                    message_id_cache.set(channel.channel_id, message);
                    return message;
                })
                .then(message => {
                    return db!
                        .update(schema.countdown_channel)
                        .set({
                            message_id: message.id,
                        })
                        .where(eq(schema.countdown_channel.channel_id, channel.channel_id));
                });
    } else if (delta_time <= NEW_COUNTDOWN_MESSAGE) {
        try {
            return message.edit({
                embeds: [get_countdown_embed(channel)],
            });
        } catch (error) {
            console.warn(`Failed to edit countdown message, creating new one: ${error}`);
            // If edit fails, fall back to creating a new message
            return text_channel
                .send({
                    embeds: [get_countdown_embed(channel)],
                })
                .then(async newMessage => {
                    try {
                        await newMessage.pin().then(_ => delete_pinned_message(text_channel));
                    } catch {
                        /* empty */
                    }
                    return newMessage;
                })
                .then(newMessage => {
                    // update cache
                    message_id_cache.set(channel.channel_id, newMessage);
                    return newMessage;
                })
                .then(newMessage => {
                    return db!
                        .update(schema.countdown_channel)
                        .set({
                            message_id: newMessage.id,
                        })
                        .where(eq(schema.countdown_channel.channel_id, channel.channel_id));
                });
        }
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
export function add_countdown(countdown: Omit<schema.Countdown, 'id'>, channel_id: string) {
    return db!.query.countdown_channel
        .findFirst({ where: eq(schema.countdown_channel.channel_id, channel_id) })
        .then(result => {
            if (result === undefined) {
                return db!.insert(schema.countdown_channel).values({
                    channel_id: channel_id,
                });
            }
        })
        .then(_ => {
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
        cron.schedule(`*/${COMMAND_UPDATE} * * * *`, _ => {
            update_countdowns(client);
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
        // ignore messages sent after
        if (Number(message.id) < Number((await get_message_by_channel_id(client, message.channelId)) || "0")) {
            return;
        }
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
                            // Minimum at 3 to ensure we don't force the bot into some weird sending loop
                            // we constantly update the bot.
                            if (channel !== undefined && channel.messages_since >= Math.max(MAX_MESSAGES_NEW_MESSAGE, 3) && handle_new_countdowns.get(message.channelId) === false) {
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
    validate: () => {
        return Promise.resolve(true);
    },
    execution: async (client, interaction) => {
        if (!interaction.isChatInputCommand()) return;
        if (db === undefined) return;
        if (!(interaction.member instanceof GuildMember)) return;
        
        const options = interaction.options;
        switch (options.getSubcommand()) {
            case "add": {
                if (!(await member_has_permission_or(interaction.member, ["Bot Developer", "Leads", "Captain"])))
                    return interaction.reply({ 
                        flags: MessageFlags.Ephemeral, 
                        embeds: [quick_embed("Error", "Insufficient permissions.", "red")]
                    }).then(_ => {});
                const date_string = options.get("date")?.value?.toString();
                const event_title = options.get("name")?.value?.toString();
                const event_link = options.get("url")?.value?.toString();
                if (date_string === undefined && event_title === undefined) return;

                const match = date_string?.match(new RegExp("^([0-9]{4})/([0-9]{2})/([0-9]{2})$"));
                if (match === null) {
                    await interaction
                        .reply({
                            flags: MessageFlags.Ephemeral,
                            embeds: [quick_embed("Error", "Invalid date format. Please use YYYY/MM/DD format", "red")]
                        })
                        .then(_ => {});
                }
                const [year, month, day] = [match![1], match![2], match![3]];
                const date = new Date(Number(year), Number(month) - 1, Number(day));
                if (date.getTime() - Date.now() <= 0) {
                    // All countdowns must be in the future
                    return interaction
                        .reply({
                            flags: MessageFlags.Ephemeral,
                            embeds: [quick_embed("Error", "Date specified should be in the future", "red")]
                        })
                        .then(_ => {});
                }
                return add_countdown(
                    {
                        title: event_title!,
                        link: event_link || null,
                        expiration: date.toISOString(),
                        channel_id: interaction.channelId,
                    },
                    interaction.channelId,
                )
                    .then(_ => get_channel_by_id?.execute({ channel_id: interaction.channelId }))
                    .then(channel => update_countdown(channel!, interaction.guild!))
                    .then(_ =>
                        interaction.reply({
                            flags: MessageFlags.Ephemeral,
                            embeds: [quick_embed("Success", "Created a countdown.", "yellow")],
                        }),
                    )
                    .then(_ => {});
            }
            case "remove": {
                if (!(await member_has_permission_or(interaction.member, ["Bot Developer", "Leads", "Captain"])))
                    return interaction.reply({ 
                        flags: MessageFlags.Ephemeral, 
                        embeds: [quick_embed("Error", "Insufficient permissions.", "red")]
                    }).then(_ => {});
                const event_name = options.get("name")?.value?.toString();
                if (event_name === undefined) {
                    return interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [quick_embed("Error", "Event name is required.", "red")]
                    }).then(_ => {});
                }
                
                // Find and delete the countdown by name in the current channel
                return db.delete(schema.countdown)
                    .where(and(
                        eq(schema.countdown.title, event_name),
                        eq(schema.countdown.channel_id, interaction.channelId)
                    ))
                    .execute()
                    .then(result => {
                        if (result.rowsAffected === 0) {
                            return interaction.reply({
                                flags: MessageFlags.Ephemeral,
                                embeds: [quick_embed("Error", `No countdown found with name "${event_name}" in this channel.`, "red")]
                            });
                        }
                        
                        // Update the countdown display after removal
                        return get_channel_by_id?.execute({ channel_id: interaction.channelId })
                            .then(channel => {
                                if (channel) {
                                    return update_countdown(channel, interaction.guild!);
                                }
                            })
                            .then(_ => 
                                interaction.reply({
                                    flags: MessageFlags.Ephemeral,
                                    embeds: [quick_embed("Success", `Countdown "${event_name}" has been removed.`, "yellow")]
                                })
                            );
                    })
                    .then(_ => {});
            }
            case "update": {                
                // Force update the countdown in the current channel
                return get_channel_by_id?.execute({ channel_id: interaction.channelId })
                    .then(channel => {
                        if (!channel) {
                            return interaction.reply({
                                flags: MessageFlags.Ephemeral,
                                embeds: [quick_embed("Error", "No countdowns found in this channel.", "red")]
                            });
                        }
                        
                        return update_countdown(channel, interaction.guild!, true)
                            .then(_ => 
                                interaction.reply({
                                    flags: MessageFlags.Ephemeral,
                                    embeds: [quick_embed("Success", "Countdown message has been updated.", "yellow")]
                                })
                            );
                    })
                    .then(_ => {});
            }
            default: {
                console.error(`Countdown service got an invalid subcommand: ${options.getSubcommand()}`);
            }
        }
    },
} satisfies Command;

const service = {
    name: "countdown",
    validate: () => Promise.resolve(true),
    commands: [countdown_command],
    events: [on_message_create],
} satisfies Service;

export default service;

