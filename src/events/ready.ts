import { Events, Client } from "discord.js";
import process from "node:process";
import { updateSubsectionRoles } from "@/events/member-update.ts";
import { DiscordClient } from "@/discord-client.ts";
import { initDoorStatus } from "@/door-status.ts";
import { startUptimeTracking } from "@/posthog.ts";

// Define MessageInfo type
interface MessageInfo {
    [channel_id: string]: {
        message_id: string;
        event_date: Date;
    };
}

export default {
    // Bind to ClientReady event
    name: Events.ClientReady,
    // Run only once (binds to client.once())
    once: true,
    // Define execution function which in this case is just print out bot user tag
    async execute(_discord_client: DiscordClient, client: Client) {
        if (!client.user) {
            throw new Error("client.user is null");
        }
        console.log(`Ready! Logged in as ${client.user.tag}`);

        // Start uptime tracking with bot ID
        await startUptimeTracking(client.user.id);

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
