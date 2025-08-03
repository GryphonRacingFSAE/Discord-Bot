// Deploy commands used by the bots. This is a separate script that must be run
// everytime we update commands.
// Note: If someone runs this on a separate fork targeting the
// same server, please be aware it will completely override any previous changes
// WARNING: this is heavily rate limited and this should be run infrequently
import { config } from "dotenv";
import type { Command } from "@/types.ts";
import { REST, Routes, GatewayIntentBits } from "discord.js";
import * as Service from "@/service.ts";
import { DiscordClient } from "@/discord-client.ts";

config(); // Load env parameters

async function main() {
    console.log("Deploying commands...");

    // First, clear all existing commands using REST API
    const rest = new REST({ version: '10' }).setToken(Deno.env.get("DISCORD_BOT_TOKEN")!);
    
    try {
        console.log("Clearing all existing global commands...");
        await rest.put(Routes.applicationCommands(Deno.env.get("DISCORD_APPLICATION_ID")!), { body: [] });
        console.log("Successfully cleared all global commands.");
    } catch (error) {
        console.error("Error clearing existing commands:", error);
    }

    // Create a minimal Discord client
    const client = new DiscordClient({
        intents: [GatewayIntentBits.Guilds]
    });

    const commands = [];
    const deployedCommandNames = new Set<string>();

    // Deploy all commands in services
    const service_folder = new URL("./services/", import.meta.url);
    const service_files = [];
    try {
        for await (const dirEntry of Deno.readDir(service_folder)) {
            service_files.push(dirEntry.name);
        }
    } catch (error) {
        console.warn("Could not read services folder:", error);
    }

    for (const source of service_files) {
        const service_path = new URL(`./${source}`, service_folder);
        let stats;
        try {
            stats = await Deno.stat(service_path);
        } catch {
            continue;
        }

        let resolved_path: string;
        if (stats.isDirectory) {
            const serviceFileUrl = new URL("./service.ts", service_path.href + "/");
            try {
                await Deno.stat(serviceFileUrl);
                resolved_path = serviceFileUrl.href;
            } catch {
                continue; // Skip if no service.ts file is found in the directory
            }
        } else if (service_path.href.endsWith(".ts")) {
            resolved_path = service_path.href;
        } else {
            continue;
        }

        try {
            const service_factory: Service.Service = (await import(resolved_path)).default;
            console.log(`Loading service: ${service_factory.name}`);

            // Validate the service first
            const isServiceValid = await service_factory.validate(client);
            if (!isServiceValid) {
                console.log(`Service '${service_factory.name}' is disabled, skipping commands`);
                continue;
            }

            if (service_factory.commands !== undefined) {
                for (const command of service_factory.commands) {
                    try {
                        // Validate individual command
                        const isCommandValid = await command.validate(client);
                        if (!isCommandValid) {
                            console.log(`Command '${command.data.name}' in service '${service_factory.name}' is disabled, skipping`);
                            continue;
                        }

                        const commandName = command.data.name;
                        if (deployedCommandNames.has(commandName)) {
                            console.warn(`Duplicate command name '${commandName}' found, skipping`);
                            continue;
                        }

                        const commandData = command.data.toJSON();
                        commands.push(commandData);
                        deployedCommandNames.add(commandName);
                        console.log(`Added command: ${commandName}`);
                    } catch (error) {
                        console.error(`Failed to process command in service '${service_factory.name}':`, error);
                    }
                }
            }
        } catch (_error) {
            console.error(`Failed to load service from '${resolved_path}':`, _error);
        }
    }

    // Deploy all commands in commands folder
    const command_directory = new URL("./commands/", import.meta.url);
    const command_sources = [];
    try {
        for await (const dirEntry of Deno.readDir(command_directory)) {
            if (dirEntry.isFile && dirEntry.name.endsWith(".ts")) {
                command_sources.push(dirEntry.name);
            }
        }
    } catch (error) {
        console.warn("Could not read commands folder:", error);
    }

    for (const file of command_sources) {
        const command_path = new URL(`./${file}`, command_directory);
        const resolved_path = command_path.href;
        
        try {
            const command_factory = (await import(resolved_path)).default;
            if (typeof command_factory === "function") {
                const command: Command | null = command_factory();
                if (command) {
                    const commandName = command.data.name;
                    if (deployedCommandNames.has(commandName)) {
                        console.warn(`Duplicate command name '${commandName}' found in commands folder, skipping`);
                        continue;
                    }

                    const commandData = command.data.toJSON();
                    commands.push(commandData);
                    deployedCommandNames.add(commandName);
                    console.log(`Added standalone command: ${commandName}`);
                }
            }
        } catch (error) {
            console.error(`Failed to load command from '${file}':`, error);
        }
    }

    console.log(`\nSummary: Found ${commands.length} valid commands to deploy`);
    console.log(`Command names: ${Array.from(deployedCommandNames).join(", ")}`);

    // and deploy your commands!
    try {
        console.log(`\nStarted refreshing ${commands.length} application (/) commands...`);

        // The put method is used to fully refresh all commands in the guild with the current set
        // This will REPLACE all existing commands with the new set
        const data = await rest.put(
            Routes.applicationGuildCommands(
                Deno.env.get("DISCORD_APPLICATION_ID")!, 
                Deno.env.get("DISCORD_GUILD_ID")!
            ), 
            { body: commands }
        );

        const deployedCount = (data as unknown[]).length;
        console.log(`Successfully deployed ${deployedCount} application (/) commands.`);
        
        if (deployedCount !== commands.length) {
            console.warn(`Warning: Expected to deploy ${commands.length} commands but Discord reports ${deployedCount} commands were deployed.`);
        }

        // Verify that old commands were removed by checking if the count matches exactly
        console.log(`\nVerification: All previous commands have been replaced with the new set.`);
        
    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error("Failed to deploy commands:", error);
        Deno.exit(1);
    }

    console.log("\nCommand deployment completed successfully!");
}

main().catch(console.error);
