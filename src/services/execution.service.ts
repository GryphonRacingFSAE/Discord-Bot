/**
 * @description Responsible for executing all commands
 */
import { Service, OnInteractCreate } from "@/service.ts";
import { CommandInteraction, Events } from "discord.js";
import { DiscordClient } from "@/discord-client.ts";

const on_interact_create = {
    run_on: [Events.InteractionCreate],
    once: false,
    validate: () => Promise.resolve(true),
    execution: async (__, client: DiscordClient, _, interaction: CommandInteraction): Promise<void> => {
        if (!interaction.isChatInputCommand()) return;
        
        // First, check service commands
        for (const [service_name, service] of client.services) {
            if (service.commands === undefined) continue;
            
            try {
                const command = service.commands.find(command => command.data.name === interaction.commandName);
                if (command) {
                    if (typeof command.execution !== 'function') {
                        console.error(`Command ${interaction.commandName} from service ${service_name} has no execution function`);
                        return;
                    }
                    try {
                        await command.execution(client, interaction);
                    } catch (err) {
                        console.error(`Failed execution of service command ${interaction.commandName}: ${err}`);
                    }
                    return;
                }
            } catch (e) {
                console.error(`Failed setup of execution for service command ${interaction.commandName} from service ${service_name}: ${e}`);
            }
        }
        
        // Then, check standalone commands
        const standalone_command = client.commands.get(interaction.commandName);
        if (standalone_command) {
            try {
                if (typeof standalone_command.execution !== 'function') {
                    console.error(`Standalone command ${interaction.commandName} has no execution function`);
                    return;
                }
                try {
                    await standalone_command.execution(client, interaction);
                } catch (err) {
                    console.error(`Failed execution of standalone command ${interaction.commandName}: ${err}`);
                }
                return;
            } catch (e) {
                console.error(`Failed setup of execution for standalone command ${interaction.commandName}: ${e}`);
            }
        }
        
        console.warn(`Command not found: ${interaction.commandName}`);
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
