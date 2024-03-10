// Deploy commands used by the bots. This is a separate script that must be run
// everytime we update commands.
// Note: If someone runs this on a separate fork targeting the
// same server, please be aware it will completely override any previous changes
// WARNING: this is heavily rate limited and this should be run infrequently
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import type { Command } from "@/types.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REST, Routes } from "discord.js";
import { promisify } from "node:util";
import * as Service from "@/service.js";
dotenv.config(); // Load env parameters
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stat = promisify(fs.stat);

const commands = [];

// Deploy all commands in services
const service_folder = path.join(__dirname, "services");
const service_files = fs.readdirSync(service_folder);
for (const source of service_files) {
    const service_path = path.join(service_folder, source);
    const stats = await stat(service_path);
    let resolved_path: string;
    if (stats.isDirectory()) {
        const serviceFilePath = path.join(service_path, "service.js");
        if (fs.existsSync(serviceFilePath)) {
            resolved_path = pathToFileURL(serviceFilePath).href;
        } else {
            continue;
        }
    } else if (service_path.endsWith(".js")) {
        resolved_path = pathToFileURL(service_path).href;
    } else {
        continue;
    }
    const service_factory: Service.Service = (await import(resolved_path)).default;
    if (service_factory.commands === undefined) continue;
    service_factory.commands.map(cmd => commands.push(cmd.data.toJSON()));
}

// Grab all the command files from the commands directory you created earlier
const command_path = path.join(__dirname, "commands");
const commmand_files = fs.readdirSync(command_path).filter(file => file.endsWith(".js")); // Compiled to js!
// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commmand_files) {
    // I genuinely have zero clue why I need to do this, but this imports it!
    const filePath = path.join(command_path, file);
    const resolvedPath = pathToFileURL(filePath).href;
    const commandFactory = (await import(resolvedPath)).default;
    if (typeof commandFactory === "function") {
        const command: Command | null = commandFactory();
        if (command) {
            // Set command to be sent to discord servers to be registered
            commands.push(command.data.toJSON());
        }
    }
}

// Construct and prepare an instance of the REST module
if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_APPLICATION_ID || !process.env.DISCORD_GUILD_ID) {
    throw new Error("Environment tokens are not defined!");
}
const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

// and deploy your commands!
try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);
    // The put method is used to fully refresh all commands in the guild with the current set
    console.log(`sending: ${commands}`);
    const data = (await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_APPLICATION_ID, process.env.DISCORD_GUILD_ID), { body: commands })) as Command[];
    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
} catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
}
console.log("Commands deployed!");
