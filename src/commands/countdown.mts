// A countdown timer that tries to stay as recent as possible as well
// updates the message every couple of minutes
import { SlashCommandBuilder } from "discord.js";
import { Command } from "../types.mjs";

export default {
    data: new SlashCommandBuilder().setName("countdown").setDescription("Start the countdown!"),
    async execute(interaction) {
        // TODO: Check on ClickUp
        await interaction.reply("Pong!");
    },
} as Command;
