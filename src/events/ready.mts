import { Events, Client } from "discord.js";
import { updateMessage } from "../message-manager.mjs";
import * as cron from "node-cron";
import fs from "node:fs";

// Define MessageInfo type
interface MessageInfo {
    [channelId: string]: {
        messageId: string;
        eventDate: Date;
    };
}

// File path for storing message info
const infoFilePath = "./messages.json";

// Load existing message info from file, or initialize to empty object
const messageInfo: MessageInfo = fs.existsSync(infoFilePath) ? JSON.parse(fs.readFileSync(infoFilePath, "utf8")) : {};

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
        for (const channelId in messageInfo) {
            if (messageInfo.hasOwnProperty.call(messageInfo, channelId)) {
                updateMessage(client, channelId, false, false, null).then(() => {
                    const task = cron.schedule("*/5 * * * *", () => updateMessage(client, channelId, true, false, task));
                    task.start();
                });
            }
        }
    },
};
