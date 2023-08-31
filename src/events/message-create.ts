import { Events, Message } from "discord.js";
import { DiscordClient } from "@/discord-client.js";
import { handleVerificationDM } from "@/vertification.js";

export default {
    name: Events.MessageCreate,
    once: false,
    async execute(client: DiscordClient, message: Message) {
        // Make sure the author is in the server
        await handleVerificationDM(client, message);
    },
};
