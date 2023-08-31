// Finds and executes command when the slash command is used

import { Events, CommandInteraction } from "discord.js";
import { DiscordClient } from "@/discord-client.js";

export default {
    name: Events.InteractionCreate,
    once: false,
    async execute(client: DiscordClient, interaction: CommandInteraction) {
        // Discard all non-command usages (slash commands)
        if (!interaction.isChatInputCommand()) return;

        // Find command via commands
        // We extended this from the base discord.js client to include a commands member
        const command = (interaction.client as DiscordClient).commands.get(interaction.commandName);

        // If no command exists, we really messed up
        // Possible errors are:
        // - Improperly synchronized slash commands (remove one command, forgot to run deploy-commands
        //   to update)
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        // Attempt to execute the command and if failed, then you goofed up or whoever made it :)
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}`);
            console.error(error);
        }
    },
};
