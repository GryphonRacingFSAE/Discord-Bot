// More accurately a shutdown command, but for all intents and purposes of running the bot,
// it functions as a restart command thanks to the docker setup

import { CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "@/types.js";

export default {
    data: new SlashCommandBuilder().setName("restart").setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog).setDescription("Restarts the bot"),
    async execute(interaction: CommandInteraction) {
        await interaction.reply(`Restarting the bot.`);
        process.exit(0);
    },
} as Command;
