import { GatewayIntentBits } from "discord.js";
import path from "node:path";
import dotenv from "dotenv";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DiscordClient } from "@/discord-client";
import type { Event } from "@/types";

dotenv.config();
// Some hack to get __dirname to work in modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new DiscordClient({ intents: [GatewayIntentBits.Guilds] });

// Load in commands
{
    // Iterate over every command/folder
    const commandsPath = path.join(__dirname, "commands");
    const command_sources = ["./commands/countdown", "./commands/ping"] as const;
    const val = (await import("./commands/countdown")).default;

    const commands = Promise.all(command_sources.map(source => import(source)));
    const commandFiles = fs.readdirSync(commandsPath).filter(
        file => file.endsWith(".js"), // Compiled to js!
    );
    // Iterate over file in said folder
    for (const file of command_sources) {
        const command = (await import(file)).default;
        // Set a new item in the Collection with the key as the command name and the value as the exported module
        client.commands.set(command.data.name, command);
    }
}

// Load in events
{
    const eventsPath = path.join(__dirname, "events");
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".mjs"));
    // Iterate over each events/*.mts file
    for (const file of eventFiles) {
        // Import files' content
        const filePath = path.join(eventsPath, file);
        const resolvedPath = pathToFileURL(filePath).href;
        const event: Event = (await import(resolvedPath)).default;
        // Attach the event onto the client
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }
}

// Login using token
client.login(process.env.DISCORD_BOT_TOKEN);
