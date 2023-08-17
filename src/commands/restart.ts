// Basic ping bot

import { CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "@/types.js";

export default {
    data: new SlashCommandBuilder().setName("restart").setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog).setDescription("Restarts the bot"),
    async execute(interaction: CommandInteraction) {
        await interaction.reply(`Restarting the bot.`);
        process.exit(0);
    },
} as Command;
