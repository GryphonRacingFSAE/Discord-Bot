import { DiscordClient } from "@/discord-client.ts";
import * as schema from "@/schema.ts";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { ChannelType, EmbedBuilder, Events, Guild, Message, MessageFlags, SlashCommandBuilder, User } from "discord.js";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Command, OnMessageCreate, OnReady, Service } from "@/service.ts";
import nodemailer from "nodemailer";
import cron from "node-cron";
import { join } from "node:path";
import { format_embed } from "@/util.ts";
import { check_members } from "@/services/permissions/index.ts";
import { db } from "@/db.ts";
import  { posthog } from "@/posthog.ts";

const CODE_LENGTH = 8;

// Generates a code randomly using cryptographically secure random number generation
function generate_verification_code(): number {
    // Generate a code from 32 bits of random data
    const array = new Uint8Array(4); 
    crypto.getRandomValues(array);
    let randomNumber = 0;
    for (let i = 0; i < array.length; i++) {
        randomNumber = (randomNumber << 8) + array[i];
    }
    return Math.abs(randomNumber) % (10 ** CODE_LENGTH);
}

/**
 * @description Generates a html verification page
 */
function get_email_html(code: string): Promise<string> {
    return Deno.readTextFile(join(Deno.cwd(), "./verification-email.html")).then(content => {
        return content.replace("{{verificationCode}}", code);
    });
}

// Prepared statement to check if an email is already linked
const email_linked =
    db !== undefined
        ? db.query.users
              .findFirst({
                  where: and(eq(schema.users.email, sql.placeholder("email")), isNotNull(schema.users.discordId)),
              })
              .prepare()
        : undefined;

/**
 * @description Sends a permissions email to the user parameter. **User parameter are not checked here**.
 * @returns Promise to completion of email
 */
async function send_verification_email(client: DiscordClient, db: LibSQLDatabase<typeof schema> | undefined, message: Message) {
    // Handle the cases where a duplicate email may exist
    if ((await email_linked?.execute({ email: message.content.toLowerCase() })) !== undefined) {
        return message.author
            .send({
                embeds: [format_embed(new EmbedBuilder().setTitle("Email exists").setDescription("This email is already registered."), "red")],
            })
            .then(_ => false);
    }
    const verification_code = generate_verification_code();
    const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE,
        auth: {
            user: process.env.EMAIL_USERNAME, // Your email address
            pass: process.env.EMAIL_APP_PASSWORD, // Your email password
        },
    });
    return get_email_html(`${verification_code.toString().substring(0, 4)} ${verification_code.toString().substring(4)}`).then(content => {
        return new Promise((resolve, reject) => {
            transporter.sendMail(
                {
                    from: process.env.EMAIL_USERNAME,
                    to: message.content.toLowerCase(),
                    subject: "Verification Code",
                    html: content,
                },
                function (error: any, info: any) {
                    if (error) {
                        console.error(error);
                        reject(error);
                    } else {
                        resolve(info);
                    }
                },
            );
        })
            .then(_ => {
                return db!
                    .insert(schema.verifying_users)
                    .values({
                        verificationCode: verification_code,
                        discordId: message.author.id,
                        email: message.content.toLowerCase(),
                    })
                    .execute();
            })
            .then(() => {
                if (posthog) {
                    posthog.capture({
                        distinctId: client.user?.id || "unknown",
                        event: "verification_email_sent",
                    });
                }
            })
            .then(async _ => {
                await message.reply({
                    embeds: [
                        format_embed(
                            new EmbedBuilder().setTitle("Sent!").setDescription("We have sent the email address an **8-digit** code. Please send message the bot the code to link the account."),
                            "yellow",
                        ),
                    ],
                });
                return true;
            })
            .catch(err => {
                console.error("Email verification error:", err);
                message.reply({
                    embeds: [format_embed(new EmbedBuilder().setTitle("Error").setDescription("Seems like our mailing service is down currently. Please be patient as we try to fix it."), "yellow")],
                });
                return false;
            });
    });
}

/**
 * @description Validates if there is a currently active verification session
 * @returns The active verification session if there is one
 */
function has_verification_session(db: LibSQLDatabase<typeof schema> | undefined, sender: User): Promise<schema.VerifyingUser | undefined> {
    return db!.query.verifying_users.findFirst({
        where: eq(schema.verifying_users.discordId, sender.id),
    });
}

/**
 * @description Since verification is a pretty expensive process, we need to rate limit people to only 15 messages/minute
 */
const sending_rates: Map<string, number> = new Map();
const RATE_LIMIT = 15; // max messages/minute
function is_rated_limited(user: User) {
    return (sending_rates.get(user.id) || 1) > RATE_LIMIT;
}

const on_message_send_event: OnMessageCreate = {
    async execution(_, client: DiscordClient, db, message): Promise<void> {
        if (db === undefined || message.author.bot || message.channel.type !== ChannelType.DM) return Promise.resolve(undefined);
        if (is_rated_limited(message.author)) return Promise.resolve(undefined);
        const user_rate = sending_rates.get(message.author.id) || 0;
        sending_rates.set(message.author.id, user_rate + 1);
        const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID!) as Guild;
        if (!guild.members.cache.has(message.author.id)) return Promise.resolve(undefined);
        const user = await has_verification_session(db, message.author);
        if (user === undefined) {
            // make a new entry
            // https://stackoverflow.com/questions/201323/how-can-i-validate-an-email-address-using-a-regular-expression
            const regex: RegExp = new RegExp(
                // eslint-disable-next-line no-control-regex
                "^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|\"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\\\[\x01-\x09\x0b\x0c\x0e-\x7f])*\")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\\])$",
            );
            if (regex.test(message.content.toLowerCase())) {
                // new verification session start
                return send_verification_email(client, db, message).then(_ => {});
            } else {
                return message
                    .reply({
                        embeds: [
                            format_embed(new EmbedBuilder().setTitle("Invalid email address").setDescription(`Your email address of \`${message.content}\` is not a valid email address.`), "red"),
                        ],
                    })
                    .then(_ => {
                        if (posthog) {
                            posthog.capture({
                                distinctId: client.user?.id || "unknown",
                                event: "verification_session_invalid_email",
                            });
                        }
                    });
            }
        } else if (Number(message.content) === user.verificationCode) {
            if ((await email_linked?.execute({ email: user.email })) !== undefined) {
                return message.author
                    .send({
                        embeds: [format_embed(new EmbedBuilder().setTitle("Email exists").setDescription("This email is already registered."), "red")],
                    })
                    .then(_ => {
                        if (posthog) {
                            posthog.capture({
                                distinctId: client.user?.id || "unknown",
                                event: "verification_session_duplicate_email",
                            });
                        }
                    });
            }
            return db
                .insert(schema.users)
                .values({
                    email: user.email,
                    discordId: user.discordId,
                } satisfies schema.NewUser)
                .onConflictDoUpdate({
                    target: schema.users.email,
                    set: { 
                        email: user.email, 
                        discordId: user.discordId 
                    }
                })
                .then(async () => check_members(client, [guild.members.cache.get(message.author.id)!]))
                .then(async () => {
                    return db.delete(schema.verifying_users).where(eq(schema.verifying_users.discordId, message.author.id)).execute();
                })
                .then(async _ => {
                    return message.reply({
                        embeds: [format_embed(new EmbedBuilder().setTitle("Linked!").setDescription("You now have successfully linked your discord and email account."), "yellow")],
                    });
                })
                .then(_ => {
                    if (posthog) {
                        posthog.capture({
                            distinctId: client.user?.id || "unknown",
                            event: "verification_code_entered",
                        });
                    }
                });
        } else if (message.content.toLowerCase().trim() === "cancel") {
            return db
                .delete(schema.verifying_users)
                .where(eq(schema.verifying_users.discordId, message.author.id))
                .execute()
                .then(_ => {
                    return message.reply({
                        embeds: [format_embed(new EmbedBuilder().setTitle("Cancelled!").setDescription("Verification process has been cancelled."), "yellow")],
                    });
                })
                .then(_ => {
                    if (posthog) {
                        posthog.capture({
                            distinctId: client.user?.id || "unknown",
                            event: "verification_session_cancelled",
                        });
                    }
                });
        } else {
            return message
                .reply({
                    embeds: [
                        format_embed(
                            new EmbedBuilder().setTitle("Invalid code").setDescription("The code you have entered is not the correct code. Type `cancel` to stop the verification process."),
                            "yellow",
                        ),
                    ],
                })
                .then(_ => {});
        }
    },
    once: false,
    run_on: [Events.MessageCreate],
    validate(_client: DiscordClient): Promise<boolean> {
        return Promise.resolve(
            process.env.EMAIL_USERNAME !== undefined &&
                process.env.EMAIL_APP_PASSWORD !== undefined &&
                process.env.EMAIL_SERVICE !== undefined &&
                process.env.DATABASE_PATH !== undefined &&
                process.env.DISCORD_GUILD_ID !== undefined,
        );
    },
};

const on_ready: OnReady = {
    execution(_, _client: DiscordClient, db): Promise<void> {
        // remove session older than one hour
        if (db === undefined) return Promise.resolve(undefined);
        cron.schedule("*/15 * * * *", async () => {
            const now = new Date().getTime();
            await db
                .delete(schema.verifying_users)
                .where(sql`${schema.verifying_users.dateCreated} < (${now} - 60*60*1000)`)
                .execute();
        }).start();
        setInterval(() => {
            sending_rates.clear();
        }, 60 * 1000);
        return Promise.resolve(undefined);
    },
    once: true,
    run_on: [Events.ClientReady],
    validate: async () => {
        return db !== undefined && process.env.DISCORD_GUILD_ID !== undefined;
    },
};

const cmd_unlink = {
    data: new SlashCommandBuilder()
        .setName("verification")
        .setDescription("Commands relating to the verification process")
        .addSubcommand(sub_command => sub_command.setName("unlink").setDescription("If you have a linked email, this will unlink it entirely."))
        .addSubcommand(sub_command => sub_command.setName("update").setDescription("Update a user's verification status immediately").addUserOption(option => option.setName("user").setDescription("The user to update"))) as SlashCommandBuilder,
    validate: async () => {
        return Promise.resolve(true);
    },
    execution: async (client, interaction) => {
        if (db === undefined || interaction.guild === undefined) {
            return interaction.reply({ flags: MessageFlags.Ephemeral, content: "DB is down." }).then(_ => {});
        }
        if (!interaction.isChatInputCommand()) return;
        
        switch (interaction.options.getSubcommand()) {
            case "unlink":
                return db
                    .update(schema.users)
                    .set({ discordId: sql`NULL` })
                    .where(eq(schema.users.discordId, interaction.user.id))
                    .then(_ =>
                        interaction.reply({
                            flags: MessageFlags.Ephemeral,
                            embeds: [format_embed(new EmbedBuilder().setTitle("Unlinked").setDescription("Successfully unlinked email from your discord account."), "yellow")],
                        }),
                    )
                    .then(_ => check_members(client, [interaction.guild!.members.cache.get(interaction.user.id)!]))
                    .then(_ => {});
            case "update": {
                const targetUser = interaction.options.getUser("user");
                if (!targetUser) {
                    return interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [format_embed(new EmbedBuilder().setTitle("Error").setDescription("Please specify a user to update."), "red")],
                    }).then(_ => {});
                }
                
                const guildMember = interaction.guild?.members.cache.get(targetUser.id);
                if (!guildMember) {
                    return interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [format_embed(new EmbedBuilder().setTitle("Error").setDescription("User not found in this server."), "red")],
                    }).then(_ => {});
                }
                await check_members(client, [guildMember]);
                
                return interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    embeds: [format_embed(new EmbedBuilder().setTitle("Updated").setDescription(`Successfully updated verification status for ${targetUser.tag}.`), "yellow")],
                }).then(_ => {});
            }
        }
        
    },
} satisfies Command;

const verificationService: Service = {
    name: "verification",
    validate: () => {
        return Promise.resolve(Deno.env.get("DISCORD_GUILD_ID") !== undefined);
    },
    events: [on_message_send_event, on_ready],
    commands: [cmd_unlink],
};

export default verificationService;
