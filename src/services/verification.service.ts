import { DiscordClient } from "@/discord-client";
import * as schema from "@/schema.js";
import { MySql2Database } from "drizzle-orm/mysql2";
import { EmbedBuilder, Events, Guild, Message, SlashCommandBuilder, User } from "discord.js";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Command, OnMessageCreate, OnReady, Service } from "@/service.js";
import nodemailer from "nodemailer";
import cron from "node-cron";
import path from "node:path";
import fs from "node:fs/promises";
import { format_embed } from "@/util.js";
import { check_members, prune_members, UserStatus } from "@/services/permissions/index.js";
import { db } from "@/db.js";

const CODE_LENGTH = 8;

// Generates a code randomly
function generate_verification_code(): number {
    return new Date().getTime() % 10 ** CODE_LENGTH;
}

/**
 * @description Generates a html verification page
 */
async function get_email_html(code: string): Promise<string> {
    return fs.readFile(path.join(process.cwd(), "./verification-email.html"), { encoding: "utf-8" }).then(content => {
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
async function send_verification_email(client: DiscordClient, db: MySql2Database<typeof schema>, message: Message) {
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
    console.log(`Sending verification email!`);
    return get_email_html(`${verification_code.toString().substring(0, 4)} ${verification_code.toString().substring(4)}`).then(async content => {
        return new Promise((resolve, reject) => {
            console.log("Sending!");
            transporter.sendMail(
                {
                    from: process.env.EMAIL_USERNAME,
                    to: message.content.toLowerCase(),
                    subject: "Verification Code",
                    html: content,
                },
                function (error, info) {
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
                return db
                    .insert(schema.verifying_users)
                    .values({
                        verificationCode: verification_code,
                        discordId: message.author.id,
                        email: message.content.toLowerCase(),
                    })
                    .execute();
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
                console.log(err);
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
async function has_verification_session(db: MySql2Database<typeof schema>, sender: User): Promise<schema.VerifyingUser | undefined> {
    return db.query.verifying_users.findFirst({
        where: eq(schema.verifying_users.discordId, sender.id),
    });
}

/**
 * @description Since verification is a pretty expensive process, we need to rate limit people to only 15 messages/minute
 */
const sending_rates: Map<string, number> = new Map();
const RATE_LIMIT = 15; // max messages/minute
function is_rated_limited(user: User) {
    console.log(`rate is: ${sending_rates.get(user.id)}`);
    return (sending_rates.get(user.id) || 1) > RATE_LIMIT;
}

const on_message_send_event: OnMessageCreate = {
    async execution(_, client: DiscordClient, db, message): Promise<void> {
        if (db === undefined || message.author.bot) return Promise.resolve(undefined);
        if (is_rated_limited(message.author)) return Promise.resolve(undefined);
        const user_rate = sending_rates.get(message.author.id) || 0;
        sending_rates.set(message.author.id, user_rate + 1);
        const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID!) as Guild;
        if (!guild.members.cache.has(message.author.id)) return Promise.resolve(undefined);
        const user = await has_verification_session(db, message.author);
        console.log(`${user}`);
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
                    .then(_ => {});
            }
        } else if (Number(message.content) === user.verificationCode) {
            if ((await email_linked?.execute({ email: user.email })) !== undefined) {
                return message.author
                    .send({
                        embeds: [format_embed(new EmbedBuilder().setTitle("Email exists").setDescription("This email is already registered."), "red")],
                    })
                    .then(_ => {});
            }
            return db
                .insert(schema.users)
                .values({
                    email: user.email,
                    discordId: user.discordId,
                } satisfies schema.NewUser)
                .onDuplicateKeyUpdate({ set: { email: user.email, discordId: user.discordId } })
                .then(async () => check_members(client, [guild.members.cache.get(message.author.id)!]))
                .then(async () => {
                    return db.delete(schema.verifying_users).where(eq(schema.verifying_users.discordId, message.author.id)).execute();
                })
                .then(async _ => {
                    return message.reply({
                        embeds: [format_embed(new EmbedBuilder().setTitle("Linked!").setDescription("You now have successfully linked your discord and email account."), "yellow")],
                    });
                })
                .then(_ => {});
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
                .then(_ => {});
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
    validate(client: DiscordClient): Promise<boolean> {
        return Promise.resolve(
            process.env.EMAIL_USERNAME !== undefined &&
                process.env.EMAIL_APP_PASSWORD !== undefined &&
                process.env.EMAIL_SERVICE !== undefined &&
                process.env.MYSQL_USER !== undefined &&
                process.env.MYSQL_PASSWORD !== undefined &&
                process.env.MYSQL_DATABASE !== undefined &&
                process.env.MYSQL_PORT !== undefined &&
                process.env.DISCORD_GUILD_ID !== undefined,
        );
    },
};

const on_ready: OnReady = {
    execution(_, client: DiscordClient, db): Promise<void> {
        // remove session older than one hour
        if (db === undefined) return Promise.resolve(undefined);
        cron.schedule("*/15 * * * *", async () => {
            const now = new Date().getTime();
            await db
                .delete(schema.verifying_users)
                .where(sql`${schema.verifying_users.dateCreated} < (${now} - 60*60*1000)`)
                .execute();
        });
        setInterval(() => {
            sending_rates.clear();
        }, 60 * 1000);
        return Promise.resolve(undefined);
    },
    once: true,
    run_on: [Events.ClientReady],
    validate: async () => {
        const validation =
            process.env.MYSQL_HOST !== undefined &&
            process.env.MYSQL_ROOT_PASSWORD !== undefined &&
            process.env.MYSQL_USER !== undefined &&
            process.env.MYSQL_PASSWORD !== undefined &&
            process.env.MYSQL_DATABASE !== undefined &&
            process.env.MYSQL_PORT !== undefined &&
            process.env.DISCORD_GUILD_ID !== undefined;
        console.log(`you got! ${validation}`);
        return validation;
    },
};

const cmd_unlink = {
    data: new SlashCommandBuilder()
        .setName("verify")
        .setDescription("Commands relating to the verification process")
        .addSubcommand(sub_command => sub_command.setName("unlink").setDescription("If you have a linked email, this will unlink it entirely.")) as SlashCommandBuilder,
    validate: async () => {
        return Promise.resolve(true);
    },
    execution: async (client, interaction) => {
        if (db === undefined || interaction.guild === undefined) {
            return interaction.reply({ ephemeral: true, content: "DB is down." }).then(_ => {});
        }
        return (db as unknown as MySql2Database<typeof schema>)
            .update(schema.users)
            .set({ discordId: sql`NULL` })
            .where(eq(schema.users.discordId, interaction.user.id))
            .then(_ =>
                interaction.reply({
                    ephemeral: true,
                    embeds: [format_embed(new EmbedBuilder().setTitle("Unliked").setDescription("Successfully unlinked email from your discord account."), "yellow")],
                }),
            )
            .then(_ => check_members(client, [interaction.guild!.members.cache.get(interaction.user.id)!]))
            .then(_ => {});
    },
} satisfies Command;

const verificationService: Service = {
    name: "verification",
    validate: async () => {
        return process.env.DISCORD_GUILD_ID !== undefined;
    },
    events: [on_message_send_event, on_ready],
    commands: [cmd_unlink],
};

export default verificationService;
