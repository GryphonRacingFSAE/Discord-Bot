import { Events, GuildMember } from "discord.js";
import { sendVerificationMessage } from "@/vertification.js";
import { DiscordClient } from "@/discord-client.js";

export default {
    name: Events.GuildMemberAdd,
    once: false,
    async execute(client: DiscordClient, new_member: GuildMember) {
        // Deal with verification here
        await sendVerificationMessage(new_member);
    },
};
