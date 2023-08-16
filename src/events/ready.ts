import { Events, Client, TextChannel } from "discord.js";
import cron from "node-cron";
import dotenv from "dotenv";
import { saveAuditLogs } from "@/commands/save-audit-logs.js";
import { updateMessage } from "@/countdown-manager.js";
import { updateSubsectionRoles } from "@/events/member-update.js";
import fs from "node:fs";
import persist from "node-persist";
import { initializeDoorStatusMessage, updateDoorStatusMessage } from "@/door-status.js";
import http from "node:http";

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
                const task = cron.schedule("*/5 * * * *", () => updateMessage(client, channel_id, true, false, task));
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

        initDoorStatus(client);
    },
};

async function initDoorStatus(client: Client) {
    await persist.init();
    console.log("Storage initialized");

    const guild_id = process.env.DISCORD_GUILD_ID;

    const guild = client.guilds.cache.get(guild_id!);
    if (!guild) {
        console.error(`Cannot find guild with ID ${guild_id!}`);
        return;
    }
    const channel = guild.channels.cache.find(ch => ch.name === "shop-open") as TextChannel | undefined;

    if (channel) {
        await initializeDoorStatusMessage(channel);
        await updateDoorStatusMessage(channel);
    } else {
        console.error("Channel not found");
    }

    const server = http.createServer(async (req, res) => {
        if (req.method === "POST" && req.url === "/update_door_status") {
            let body = "";

            req.on("data", chunk => {
                body += chunk.toString();
            });

            req.on("end", async () => {
                const parsed_data = JSON.parse(body);
                console.log("Received data:", parsed_data);

                if (channel) await updateDoorStatusMessage(channel);

                res.statusCode = 200;
                res.setHeader("Content-Type", "text/plain");
                res.end("Data received successfully");
            });
        } else {
            res.statusCode = 404;
            res.setHeader("Content-Type", "text/plain");
            res.end("Not Found");
        }
    });

    const PORT = 8080;
    server.listen(PORT, () => {
        console.log(`HTTP server is running on port ${PORT}`);
    });
}
