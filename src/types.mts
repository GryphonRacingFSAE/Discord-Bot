// Types class
import { SlashCommandBuilder, CommandInteraction, Events, ClientEvents, Awaitable } from "discord.js";

export type Command = {
    /**
     * Represents the command data from discord.js SlashCommandBuffer (name, etc.)
     */
    data: SlashCommandBuilder;
    /**
     * A which executes upon command calling
     * @param interaction The given discord.js CommandInteraction
     */
    execute: (interaction: CommandInteraction) => Promise<void>;
};

export type Event = {
    /**
     * Name of the event which the execute function should attach to
     */
    name: Exclude<Events, keyof ClientEvents>;
    /**
     * True if the event should only be run once
     */
    once: boolean;
    /**
     * Execution function
     * @param args Left as unknown, so it can work with arbitrary events as discord.js may
     * provide different types
     */
    execute: (...args: unknown[]) => Awaitable<void>;
};
