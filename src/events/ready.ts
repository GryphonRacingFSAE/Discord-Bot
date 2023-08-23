import { Events, Client } from "discord.js";
import cron from "node-cron";
import dotenv from "dotenv";
import { saveAuditLogs } from "@/commands/save-audit-logs.js";
import { updateMessage } from "@/countdown-manager.js";
import { updateSubsectionRoles } from "@/events/member-update.js";
import fs from "node:fs";
import { initDoorStatus } from "@/door-status.js";

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

export default {
    // Bind to ClientReady event
    name: Events.ClientReady,
    // Run only once (binds to client.once())
    once: true,
    // Define execution function which in this case is just print out bot user tag
    async execute(client: Client) {
        if (!client.user) {
            throw new Error("client.user is null");
        }
        console.log(`Ready! Logged in as ${client.user.tag}`);

        // Iterate over all the stored message info and start the countdowns
        for (const channel_id in message_info) {
            // Create a new update schedule for each message, but will destruct
            // if the message it is editing is destroyed
            // Janky? Yeah, but to be honest it works *good enough*
            updateMessage(client, channel_id, false, false, null).then(() => {
                const task = cron.schedule("*/5 * * * *", () => {
                    try {
                        console.log("Updating message");
                        updateMessage(client, channel_id, true, false, task);
                    } catch (error) {
                        console.log("Error while updating cron startup task: ", error);
                    }
                });
                task.start();
            });
        }

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
            updateSubsectionRoles(member);
        }

        // Initialize the door status code (see door-status.ts)
        initDoorStatus(client);
    },
};
