// Types class
import { SlashCommandBuilder, CommandInteraction, Events, Client } from "discord.js"


export type Types = {
    data: SlashCommandBuilder,
    execute: (interaction: CommandInteraction) => Promise<void>;
}

export type Event = {
    name: Events,
    once: boolean,
    execute: (client: Client) => void,
}