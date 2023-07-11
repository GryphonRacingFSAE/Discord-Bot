import { GatewayIntentBits } from "discord.js";
import path from "node:path";
import * as dotenv from "dotenv";
import * as fs from "fs";
import { dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { DiscordClient } from "./discordClient.mjs";
import { Command, Event } from "./types.mjs";

dotenv.config();
// Some hack to get __dirname to work in modules
const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new DiscordClient({ intents: [GatewayIntentBits.Guilds] });

// Load in commands
{
    const foldersPath = path.join(__dirname, "commands");
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(
            file => file.endsWith(".mjs"), // Compiled to js!
        );

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const resolvedPath = pathToFileURL(filePath).href;
            const command: Command = (await import(resolvedPath)).default;
            // Set a new item in the Collection with the key as the command name and the value as the exported module
            if (command && `data` in command && `execute` in command) {
                client.commands.set(command.data.name, command);
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }
}

// Load in events
{
    const eventsPath = path.join(__dirname, "events");
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".mjs"));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const resolvedPath = pathToFileURL(filePath).href;
        const event: Event = (await import(resolvedPath)).default;
        if (`name` in event && `execute` in event) {
            if (event.once) {
                console.log("Once");
                client.once(event.name, (...args) => event.execute(...args));
            } else {
                console.log("on");
                client.on(event.name, (...args) => event.execute(...args));
            }
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "name" or "execute" property.`);
        }
    }

    {
        console.log("I should error!");
    }
}

// Login using token
client.login(process.env.DISCORD_BOT_TOKEN);
