// Basic ping command
// START HERE IF YOU'RE NEW!

import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import type { Command } from "@/types.js";

export default function commandFactory() {
    return {
        /*
         * Define information about the bot required by discord.js
         */
        data: new SlashCommandBuilder().setName("ping").setDescription("Ping the bot!"),
        /*
         * An asynchronous function that is executed when the command is called
         * `interaction` contains any information about the interaction used to invoke the command
         */
        async execute(interaction: CommandInteraction) {
            const delta = Math.abs((Date.now() - interaction.createdTimestamp) / 1000).toFixed(2);
            await interaction.reply(`Pong in ${delta} seconds!`);
        },
    } as Command;
}
