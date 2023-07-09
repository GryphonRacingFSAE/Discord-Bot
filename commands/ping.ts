// Obligatory ping testing

import {SlashCommandBuilder} from "discord.js";
import{Command} from "../command"

export default Command
{
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Ping testing")
    async function execute(interaction)
    {
        await interaction.reply("Pong!");
    }
}