// Deploy commands used by the bots. This is a separate script that must be run
// everytime we update commands.
// Note: If someone runs this on a separate fork targeting the
// same server, please be aware it will completely override any previous changes
// WARNING: this is heavily rate limited and this should be run infrequently
import { REST } from "discord.js";
import { Routes } from "discord-api-types/v9";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { Command } from "./types.mjs";
import { dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
dotenv.config(); // Load env parameters
const __dirname = dirname(fileURLToPath(import.meta.url));

const commands = [];
// Grab all the command files from the commands directory you created earlier
const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    // Grab all the command files from the commands directory you created earlier
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".mjs")); // Compiled to js!
    // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
    for (const file of commandFiles) {
        // I genuinely have zero clue why I need to do this, but this imports it!
        const filePath = path.join(commandsPath, file);
        const resolvedPath = pathToFileURL(filePath).href;
        const command: Command = (await import(resolvedPath)).default;
        if (command && "data" in command && "execute" in command) {
            // Set command to be sent to discord servers to be registered
            commands.push(command.data.toJSON());
        } else {
            // You goofed up
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

// and deploy your commands!
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // The put method is used to fully refresh all commands in the guild with the current set
        const data = (await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_APPLICATION_ID, process.env.DISCORD_GUILD_ID), { body: commands })) as Command[];

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
})();
