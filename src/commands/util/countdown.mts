import { SlashCommandBuilder } from "discord.js";
import { Command } from "../../types.mjs";

export default {
    data: new SlashCommandBuilder().setName("countdown").setDescription("Start the countdown!"),
    async execute(interaction) {
        await interaction.reply("Pong!");
    },
} as Command;
