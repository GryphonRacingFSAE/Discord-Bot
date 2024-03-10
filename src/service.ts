// This increases complexity, yes, but it makes it easier
// for us to ensure we don't accidentally run services which are not meant to run
import { ClientEvents, CommandInteraction, Events, GuildMember, Message, MessageInteraction, SlashCommandBuilder } from "discord.js";
import { DiscordClient } from "@/discord-client.js";
import { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "@/schema.js";

/**
 * @description Describes a command template
 */
export type Command = {
    data: SlashCommandBuilder;
    /**
     * @description Validates if a command should be included or not.
     * @param client Discord client
     * @returns Promise<boolean> to determine if the command should be active.
     */
    validate: (client: DiscordClient) => Promise<boolean>;
    execution: (client: DiscordClient, interaction: CommandInteraction) => Promise<void>;
};

/**
 * @description Ran on a specific event
 */
export type Event<T extends unknown[]> = {
    run_on: (keyof ClientEvents)[];
    /**
     * @description Whether the event should just be run once
     */
    once: boolean;
    /**
     * @description Validates if a event should be included or not
     */
    validate: (client: DiscordClient) => Promise<boolean>;
    execution: (eventName: keyof ClientEvents, ...args: T) => Promise<void>;
};

// Define commonly used events
export type OnReady = Event<[DiscordClient, MySql2Database<typeof schema> | undefined]>;
export type OnMessageCreate = Event<[DiscordClient, MySql2Database<typeof schema> | undefined, Message]>;
export type OnMemberUpdate = Event<[DiscordClient, MySql2Database<typeof schema> | undefined, GuildMember, GuildMember]>;

/**
 * @description The bare minimum a verificationService can have
 */
export type Service = {
    name: string;
    /**
     * @description Validates the verificationService provided and determines if it should be toggled on/off
     * @param client Discord client
     * @returns Promise<boolean> If `true`, verificationService is on. If `false`, verificationService is off.
     */
    validate: (client: DiscordClient) => Promise<boolean>;

    /**
     * @description Defines commands of the verificationService
     */
    commands?: Command[];

    /**
     * @description Defines events of the command
     */
    events?: (Event<unknown[]> | OnReady | OnMemberUpdate | OnMessageCreate)[];
};
