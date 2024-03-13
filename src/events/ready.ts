import { Events, Client } from "discord.js";
import cron from "node-cron";
import dotenv, { config } from "dotenv";
import { saveAuditLogs } from "@/commands/save-audit-logs.js";
import { updateSubsectionRoles } from "@/events/member-update.js";
import fs from "node:fs";
import { DiscordClient } from "@/discord-client";
import { initDoorStatus } from "@/door-status.js";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import puppeteer from "puppeteer";
import * as schema from "@/schema.js";
import * as email_webscrapper from "@/scrapper/email_webscrapper.js";

dotenv.config();

// Define MessageInfo type
interface MessageInfo {
    [channel_id: string]: {
        message_id: string;
        event_date: Date;
    };
}

// File path for storing message info
const info_file_path = "./resources/messages.json";

// Load existing message info from file, or initialize to empty object
const message_info: MessageInfo = fs.existsSync(info_file_path) ? JSON.parse(fs.readFileSync(info_file_path, "utf8")) : {};

const RUNNING_IN_DOCKER = process.env.RUNNING_IN_DOCKER === "true";

export default {
    // Bind to ClientReady event
    name: Events.ClientReady,
    // Run only once (binds to client.once())
    once: true,
    // Define execution function which in this case is just print out bot user tag
    async execute(discord_client: DiscordClient, client: Client) {
        if (!client.user) {
            throw new Error("client.user is null");
        }
        console.log(`Ready! Logged in as ${client.user.tag}`);

        // Start web-scrapping
        const browser = await puppeteer.launch({ headless: RUNNING_IN_DOCKER ? "new" : false, args: RUNNING_IN_DOCKER ? ["--no-sandbox", "--disable-setuid-sandbox"] : [] });

        // Initialize email web-scrapper
        await Promise.all([email_webscrapper.on_ready(browser)]);

        // Schedule weekly audit log saving:
        // Saturday @ 11:59 PM
        const audit_logs_job = cron.schedule(
            "59 23 * * 6",
            async () => {
                const guild_id = process.env.DISCORD_GUILD_ID;

                // Fetch the guild
                const guild = client.guilds.cache.get(guild_id!);
                if (!guild) {
                    console.error(`Cannot find guild with ID ${guild_id!}`);
                    return;
                }

                // Call the function and handle any errors
                try {
                    await saveAuditLogs(null, guild);
                    console.log("Audit logs saved successfully.");
                } catch (error) {
                    console.error("Error occurred while saving audit logs:", error);
                }
            },
            {
                scheduled: true,
                timezone: "America/Toronto",
            },
        );

        audit_logs_job.start();

        // On login, update all subsection roles that might've been missed
        const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID!);
        if (!guild) {
            console.error(`Cannot find guild with ID ${process.env.DISCORD_GUILD_ID!}`);
            return;
        }

        await guild.members.fetch();
        for (const member of guild.members.cache.values()) {
            await updateSubsectionRoles(member);
        }
        // Initialize the door status code (see door-status.ts)
        await initDoorStatus(client);
    },
};
