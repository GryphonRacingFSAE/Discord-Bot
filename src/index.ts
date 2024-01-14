import { GatewayIntentBits, Partials } from "discord.js";
import dotenv from "dotenv";
import { DiscordClient } from "@/discord-client.js";
import type { Command, Event } from "@/types.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
dotenv.config();

// Check for all environments
if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_APPLICATION_ID || !process.env.DISCORD_GUILD_ID) {
    throw new Error("Environment tokens are not defined!");
}

// Some hack to get __dirname to work in modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new DiscordClient({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages],
    partials: [Partials.Message, Partials.Channel, Partials.User],
});

// Load in commands
{
    // Iterate over every command/folder
    const command_directory = path.join(__dirname, "commands");
    const command_sources = fs.readdirSync(command_directory).filter(file => file.endsWith(".js"));

    // Iterate over file in said folder
    for (const file of command_sources) {
        const command_path = path.join(command_directory, file);
        const resolved_path = pathToFileURL(command_path).href;
        const command_factory = (await import(resolved_path)).default;
        // Set a new item in the Collection with the key as the command name and the value as the exported module
        if (typeof command_factory === "function") {
            const command: Command | null = command_factory();
            if (command) {
                client.commands.set(command.data.name, command);
                console.log(`Loaded command ${command.data.name}`);
            }
        }
    }
}

// Load in events
{
    const event_directory = path.join(__dirname, "events");
    const event_files = fs.readdirSync(event_directory).filter(file => file.endsWith(".js"));

    // Iterate over each event file
    for (const file of event_files) {
        // Import files' content
        const event_path = path.join(event_directory, file);
        const resolved_path = pathToFileURL(event_path).href;
        const event: Event = (await import(resolved_path)).default;

        // Attach the event onto the client
        if (event.once) {
            client.once(event.name, (...args) => event.execute(client, ...args));
        } else {
            client.on(event.name, (...args) => event.execute(client, ...args));
        }
        console.log(`Loaded event ${event.name}`);
    }
}

// Login using token
console.log("Logging in...");
client.login(process.env.DISCORD_BOT_TOKEN);
