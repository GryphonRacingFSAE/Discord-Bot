// Basic ping bot

import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import type { Command } from "@/types";

export default {
    data: new SlashCommandBuilder().setName("ping").setDescription("Ping the bot!"),
    async execute(interaction: CommandInteraction) {
        const delta = Math.abs((Date.now() - interaction.createdTimestamp) / 1000).toFixed(2);
        await interaction.reply(`Pong in ${delta} seconds!`);
    },
} as Command;
