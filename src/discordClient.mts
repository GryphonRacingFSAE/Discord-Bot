import { Client, ClientOptions, Collection } from "discord.js";
import { Command } from "./types.mjs";

export class DiscordClient extends Client {
    commands: Collection<string, Command>;

    constructor(options?: ClientOptions) {
        super(options);
        this.commands = new Collection();
    }
}
