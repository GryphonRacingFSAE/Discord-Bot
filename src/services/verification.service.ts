import { DiscordClient } from "@/discord-client";
import * as schema from "@/schema.js";
import { MySql2Database } from "drizzle-orm/mysql2";
import { EmbedBuilder, Events, Guild, Message, User } from "discord.js";
import { eq, sql } from "drizzle-orm";
import type { OnMessageCreate, OnReady, Service } from "@/service.js";
import nodemailer from "nodemailer";
import cron from "node-cron";
const CODE_LENGTH = 8;

// Generates a code randomly
function generate_verification_code(): number {
    return new Date().getTime() % 10 ** CODE_LENGTH;
}

/**
 * @description Sends a permissions email to the user parameter. **User parameter are not checked here**.
 * @returns Promise to completion of email
 */
async function send_verification_email(client: DiscordClient, db: MySql2Database<typeof schema>, message: Message) {
    const verification_code = generate_verification_code();
    const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE,
        auth: {
            user: process.env.EMAIL_USERNAME, // Your email address
            pass: process.env.EMAIL_PASSWORD, // Your email password
        },
    });

    transporter.sendMail(
        {
            from: process.env.EMAIL_USERNAME,
            to: message.content.toLowerCase(),
            subject: "Verification Code",
            html: `<h1>Your password is here</h1> <p>Your verification code is ${verification_code}<p>`,
        },
        function (error, info) {
            if (error) {
                console.log(error);
            } else {
                console.log("Email sent: " + info.response);
            }
        },
    );

    await db
        .insert(schema.verifying_users)
        .values({
            verificationCode: verification_code,
            discordId: message.author.id,
            email: message.content.toLowerCase(),
        })
        .execute();
}

/**
 * @description Validates if there is a currently active verification session
 * @returns The active verification session if there is one
 */
async function has_verification_session(db: MySql2Database<typeof schema>, sender: User): Promise<schema.VerifyingUser | undefined> {
    return db
        .select()
        .from(schema.verifying_users)
        .where(eq(schema.verifying_users.discordId, sender.id))
        .execute()
        .then(res => {
            return res.length > 0 ? res[0] : undefined;
        });
}

const on_message_send_event: OnMessageCreate = {
    async execution(_, client: DiscordClient, db, message): Promise<void> {
        if (db === undefined || message.author.bot) return Promise.resolve(undefined);
        const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID!) as Guild;
        if (!guild.members.cache.has(message.author.id)) return Promise.resolve(undefined);
        const user = await has_verification_session(db, message.author);
        if (user === undefined) {
            // make a new entry
            // https://stackoverflow.com/questions/201323/how-can-i-validate-an-email-address-using-a-regular-expression
            const regex: RegExp = new RegExp(
                // eslint-disable-next-line no-control-regex
                "(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|\"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\\\[\x01-\x09\x0b\x0c\x0e-\x7f])*\")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\\])",
            );
            if (regex.test(message.content.toLowerCase())) {
                // new verification session start
                await send_verification_email(client, db, message);
            }
        } else if (message.content === user.verificationCode.toString()) {
            await db.delete(schema.verifying_users).where(eq(schema.verifying_users.discordId, message.author.id)).execute();
            await message.reply({
                embeds: [
                    new EmbedBuilder().setTitle("Linked!").setDescription("You now have successfully linked your discord and email account.").setColor("#C20430").setFooter({
                        text: "UofG Racing Bot will never ask for passwords, credit card information, SSNs, ID, security tokens that are not from us, and/or personal information. Stay safe!",
                    }),
                ],
            });
        }
        return Promise.resolve(undefined);
    },
    once: false,
    run_on: [Events.MessageCreate],
    validate(client: DiscordClient): Promise<boolean> {
        return Promise.resolve(
            process.env.EMAIL_USERNAME !== undefined &&
                process.env.EMAIL_PASSWORD !== undefined &&
                process.env.EMAIL_SERVICE !== undefined &&
                process.env.MYSQL_HOST !== undefined &&
                process.env.MYSQL_ROOT_PASSWORD !== undefined &&
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
        if (db === undefined) return Promise.resolve(undefined);
        cron.schedule("0 0 0 15 *", async () => {
            const now = new Date().getTime();
            await db
                .delete(schema.verifying_users)
                .where(sql`${schema.verifying_users.dateCreated} < now - 60*60*1000`)
                .execute();
        });
        return Promise.resolve(undefined);
    },
    once: true,
    run_on: [Events.ClientReady],
    validate(client: DiscordClient): Promise<boolean> {
        return Promise.resolve(
            process.env.MYSQL_HOST !== undefined &&
                process.env.MYSQL_ROOT_PASSWORD !== undefined &&
                process.env.MYSQL_USER !== undefined &&
                process.env.MYSQL_PASSWORD !== undefined &&
                process.env.MYSQL_DATABASE !== undefined &&
                process.env.MYSQL_PORT !== undefined &&
                process.env.DISCORD_GUILD_ID !== undefined,
        );
    },
};

const verificationService: Service = {
    name: "verification",
    validate: async () => {
        return process.env.DISCORD_GUILD_ID !== undefined;
    },
    events: [on_message_send_event],
};

export default verificationService;
