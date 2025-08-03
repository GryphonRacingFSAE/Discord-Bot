import * as Service from "@/service.ts";
import { DiscordClient } from "@/discord-client.ts";
import { CommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";

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
                await interaction.reply({ content: `Pong in ${delta} seconds!`, flags: MessageFlags.Ephemeral });
            },

            /**
             * @description Validates command prior to execution. If returns false, command will not be executed at all.
             */
            validate: async () => {
                return Promise.resolve(true);
            },
        },
    ],
};

export default service;
