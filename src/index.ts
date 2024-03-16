import { Events, GatewayIntentBits, Partials } from "discord.js";
import dotenv from "dotenv";
import { DiscordClient } from "@/discord-client.js";
import type { Command, Event } from "@/types.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as Service from "@/service.js";
import * as schema from "@/schema.js";
import { promisify } from "node:util";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { MySql2Database } from "drizzle-orm/mysql2";
import { db } from "@/db.js";
import { migrate } from "drizzle-orm/mysql2/migrator";
dotenv.config();

// Check for all environments
if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_APPLICATION_ID || !process.env.DISCORD_GUILD_ID) {
    throw new Error("Environment tokens are not defined!");
}

// Some hack to get __dirname to work in modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const service_folder = path.join(__dirname, "services");
const service_sources = fs.readdirSync(service_folder);
const RUNNING_IN_DOCKER = process.env.RUNNING_IN_DOCKER === "true";
const stat = promisify(fs.stat);

const client = new DiscordClient({
    intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages],
    partials: [Partials.Message, Partials.Channel, Partials.User],
});

console.log("Starting");

async function main() {
    console.log("Starting bot...");
    // Load in db
    if (db !== undefined) {
        try {
            await migrate(db, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
        } catch (_) {
            /* block empty */
            console.warn("Failed migration!");
        }
    } else {
        console.warn("Failed to load db!");
    }

    // Load in services
    {
        await Promise.all(
            service_sources.map(async source => {
                // there are 2 ways to make a valid verificationService:
                // - my-verification.service.ts
                // - my-foldr
                //    L index.ts
                //    L a.ts
                //    L verification.service.ts <--
                const service_path = path.join(service_folder, source);
                const stats = await stat(service_path);
                let resolved_path: string;
                if (stats.isDirectory()) {
                    const serviceFilePath = path.join(service_path, "service.js");
                    if (fs.existsSync(serviceFilePath)) {
                        resolved_path = pathToFileURL(serviceFilePath).href;
                    } else {
                        return undefined; // Skip if no verificationService.ts file is found in the directory
                    }
                } else if (service_path.endsWith(".js")) {
                    resolved_path = pathToFileURL(service_path).href;
                } else {
                    return undefined;
                }

                // TODO: USE ZOD OR SOME DYNAMIC TYPE VALIDATOR!!!
                const service_factory: Service.Service = (await import(resolved_path)).default;
                console.log(`Loading service ${service_factory.name}`);
                if (!(await service_factory.validate(client))) {
                    console.log(`${service_factory.name} failed validation. Turning off!`);
                    return undefined;
                }
                if (service_factory.commands !== undefined) {
                    const validated_commands = await Promise.all(
                        service_factory.commands.map(async command => {
                            const validated = await command.validate(client);
                            if (!validated) {
                                console.log(`${command.data.name} failed validation. Turning off!`);
                            }
                            return validated ? command : null;
                        }),
                    );
                    service_factory.commands = validated_commands.filter((command): command is Service.Command => command !== null);
                }
                if (service_factory.events !== undefined) {
                    const validated_events = await Promise.all(
                        service_factory.events.map(async event => {
                            const validated = await event.validate(client);
                            if (!validated) {
                                console.log(`${event.run_on} failed validation. Turning off!`);
                            }
                            return validated ? event : null;
                        }),
                    );
                    service_factory.events = validated_events.filter((service): service is Service.Event<unknown[]> => service !== null);
                }
                console.log(`Loaded service: ${service_factory.name}`);
                return service_factory;
            }),
        )
            .then(services =>
                services
                    .filter((service): service is Service.Service => service !== undefined)
                    .map(service => {
                        client.services.set(service.name, service);
                    }),
            )
            .catch(err => {
                console.error(`Failed to load services due to: ${err}`);
            });
    }

    // Load verificationService events
    for (const [_, service] of client.services) {
        if (!service.events) continue;
        service.events.map(event => {
            const method = event.once ? "once" : "on";
            // Use the function application method to correctly apply event listeners
            event.run_on.map(async run_on => {
                client[method](run_on, async (...args: unknown[]) => {
                    // The 'execute' function expects the event name as the first argument
                    // followed by the database instance 'db' and then any event arguments
                    return await (event as Service.Event<unknown[]>).execution(run_on, client, db, ...args);
                });
                console.log(`${service.name} loaded event: ${run_on}`);
            });
        });
    }

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

    client.on(Events.Error, error => {
        console.error(`An error occurred: ${error}`);
    });

    // Login using token
    await client.login(process.env.DISCORD_BOT_TOKEN);
}
console.log("Starting!");
main().catch(err => console.error(err));
