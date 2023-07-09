// Types class
import {SlashCommandBuilder, CommandInteraction, Events, Client, ClientEvents, Awaitable} from "discord.js"


export type Command = {
    data: SlashCommandBuilder,
    execute: (interaction: CommandInteraction) => Promise<void>;
}

export type Event = {
    name: Exclude<Events, keyof ClientEvents>,
    once: boolean,
    execute: (...args: any[]) => Awaitable<void>,
}