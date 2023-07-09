import { Events } from "discord.js"
import { Event } from "../types.mjs"
import {DiscordClient} from "../discordClient.mjs"

export default Event
{
    Events.InteractionCreate
    false
    async function execute(interaction) {
        if (!interaction.isChatInputCommand()) return;

        const command = (interaction.client as DiscordClient).commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}`);
            console.error(error);
        }
    }
}