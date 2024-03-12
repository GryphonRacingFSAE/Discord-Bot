import * as Service from "@/service.js";
import { DiscordClient } from "@/discord-client";
import { CommandInteraction, SlashCommandBuilder } from "discord.js";

const service: Service.Service = {
    validate(client: DiscordClient): Promise<boolean> {
        return Promise.resolve(true);
    },
    name: "ping",
    commands: [
        {
            /**
             * @description Defines standard information about the command
             */
            data: new SlashCommandBuilder().setName("ping").setDescription("Ping the bot!"),

            /**
             * @description What is executed on call
             */
            execution: async (client, interaction) => {
                const delta = Math.abs((Date.now() - interaction.createdTimestamp) / 1000).toFixed(2);
                await interaction.reply({ content: `Pong in ${delta} seconds!`, ephemeral: true });
            },

            validate: async () => {
                return Promise.resolve(true);
            },
        },
    ],
};

export default service;
