// More accurately a shutdown command, but for all intents and purposes of running the bot,
// it functions as a restart command thanks to the docker setup

import { CommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "@/types.ts";

export default function commandFactory() {
    return {
        data: new SlashCommandBuilder().setName("restart").setDescription("Restarts the bot"),
        async execute(interaction: CommandInteraction) {
            {
                // Determine permission to use
                const guild = interaction.guild;
                if (!guild) {
                    await interaction.reply({
                        content: "This command can only be used in a server (guild)",
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
                const member = guild.members.cache.get(interaction.user.id);
                const captain_role = guild.roles.cache.find(role => role.name === "Captain");
                const lead_role = guild.roles.cache.find(role => role.name === "Leads");
                const bot_manager_role = guild.roles.cache.find(role => role.name === "Bot Developer");
                if (
                    !member ||
                    (!(captain_role && member.roles.cache.has(captain_role.id)) &&
                        !(lead_role && member.roles.cache.has(lead_role.id)) &&
                        !(bot_manager_role && member.roles.cache.has(bot_manager_role.id)))
                ) {
                    await interaction.reply({
                        content: "You do not have the necessary permissions to use this command",
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
            }
            await interaction.reply(`Restarting the bot.`);
            process.exit(0);
        },
    } as Command;
}
