// Extends the discord.js client to add a commands member to help with
// command execution

import { Client, type ClientOptions, Collection } from "discord.js";
import type { Command } from "./types";

export class DiscordClient extends Client {
    /**
     * A collection of commands and their name which is used to quickly
     * search and find the command to execute
     */
    commands: Collection<string, Command>;

    constructor(options: ClientOptions) {
        super(options);
        // Leave blank
        this.commands = new Collection();
    }
}
