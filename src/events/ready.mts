import { Events, Client } from "discord.js";
import { updateMessage } from "../countdown-manager.mjs";
import * as cron from "node-cron";
import fs from "node:fs";

// Define MessageInfo type
interface MessageInfo {
    [channel_id: string]: {
        message_id: string;
        event_date: Date;
    };
}

// File path for storing message info
const info_file_path = "./messages.json";

// Load existing message info from file, or initialize to empty object
const message_info: MessageInfo = fs.existsSync(info_file_path) ? JSON.parse(fs.readFileSync(info_file_path, "utf8")) : {};

export default {
    // Bind to ClientReady event
    name: Events.ClientReady,
    // Run only once (binds to client.once())
    once: true,
    // Define execution function which in this case is just print out bot user tag
    execute(client: Client) {
        if (client.user === null) {
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
    },
};
