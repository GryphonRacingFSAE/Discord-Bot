/**
 * @description Responsible for executing all commands
 */
import { Service, Event, OnInteractCreate } from "@/service.js";
import { CommandInteraction, Events } from "discord.js";
import { DiscordClient } from "@/discord-client";

const on_interact_create = {
    run_on: [Events.InteractionCreate],
    once: false,
    validate: () => Promise.resolve(true),
    execution: async (__, client: DiscordClient, _, interaction: CommandInteraction) => {
        if (!interaction.isChatInputCommand()) return;
        // iterate services and check if they have the correct command
        for (const [_, service] of client.services) {
            if (service.commands === undefined) continue;
            try {
                return service.commands
                    .filter(command => command.data.name === interaction.commandName)[0]
                    .execution(client, interaction)
                    .then(_ => {})
                    .catch(err => console.error(`Failed execution of command: ${err}`));
            } catch (e) {
                console.error(`Failed setup of execution for ${interaction.commandName}: ${e}`);
            }
        }
    },
} satisfies OnInteractCreate;
const service = {
    name: "execution",
    validate: () => {
        return Promise.resolve(true);
    },
    events: [on_interact_create],
} satisfies Service;

export default service;
