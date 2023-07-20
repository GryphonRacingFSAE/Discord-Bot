import { Events, Client } from "discord.js";
import cron from "node-cron";
import dotenv from "dotenv";
import { saveAuditLogs } from "../commands/save-audit-logs.mjs";

dotenv.config();

export default {
    // Bind to ClientReady event
    name: Events.ClientReady,
    // Run only once (binds to client.once())
    once: true,
    // Define execution function which in this case is just print out bot user tag
    execute(client: Client) {
        if (!client.user) {
            throw new Error("client.user is null");
        }
        console.log(`Ready! Logged in as ${client.user.tag}`);

        // Schedule weekly audit log saving:
        // Saturday @ 11:59 PM
        cron.schedule("59 23 * * 6", async () => {
            const guild_id = process.env.DISCORD_GUILD_ID;

            // Check if guild_id is undefined
            if (!guild_id) {
                console.error("DISCORD_GUILD_ID environment variable is not set.");
                return;
            }

            // Fetch the guild
            const guild = client.guilds.cache.get(guild_id);
            if (!guild) {
                console.error(`Cannot find guild with ID ${guild_id}`);
                return;
            }

            // Call the function and handle any errors
            try {
                await saveAuditLogs(null, guild);
                console.log("Audit logs saved successfully.");
            } catch (error) {
                console.error("Error occurred while saving audit logs:", error);
            }
        });
    },
};
