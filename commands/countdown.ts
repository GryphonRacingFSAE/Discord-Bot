import { SlashCommandBuilder } from "discord.js"
import {Command} from "../command"
// Deals with countdowns

export default Command
{
    new SlashCommandBuilder()
        .setName("countdown")
        .setDescription("Start the countdown!")
    async function execute(interaction) {
        await interaction.reply("Pong!");
    }
}