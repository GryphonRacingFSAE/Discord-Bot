import { SlashCommandBuilder } from "discord.js"
import {Types} from "../.././types.mjs"

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Ping the bot!"),
    async execute(interaction) {
        await interaction.reply("Pong!");
    }
} as Types;