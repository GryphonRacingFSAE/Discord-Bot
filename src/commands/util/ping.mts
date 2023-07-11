// Basic ping bot

import { SlashCommandBuilder } from "discord.js";
import { Command } from "../../types.mjs";

export default {
    data: new SlashCommandBuilder().setName("ping").setDescription("Ping the bot!"),
    async execute(interaction) {
        const delta = Math.abs((Date.now() - interaction.createdTimestamp) / 1000).toFixed(2);
        await interaction.reply(`Pong in ${delta} seconds!`);
    },
} as Command;
