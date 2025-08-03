import { Events, GatewayIntentBits, Partials } from "discord.js";
import { config } from "dotenv";
import { DiscordClient } from "@/discord-client.ts";
import type { Event } from "@/types.ts";
import * as Service from "@/service.ts";
import { db } from "@/db.ts";
import { cleanup as cleanupPostHog } from "@/posthog.ts";

// Load environment variables
config();

// Check for all environments
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
const DISCORD_APPLICATION_ID = Deno.env.get("DISCORD_APPLICATION_ID");
const DISCORD_GUILD_ID = Deno.env.get("DISCORD_GUILD_ID");

if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID || !DISCORD_GUILD_ID) {
    throw new Error("Environment tokens are not defined!");
}

// Get service folder using proper Deno URL resolution
const service_folder = new URL("./services/", import.meta.url);

const client = new DiscordClient({
    intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages],
    partials: [Partials.Message, Partials.Channel, Partials.User],
});

async function main() {
    // Load in db
    if (db !== undefined) {
        console.log("Database loaded successfully!");
        // Migrations are handled by db_migration.sh script
    } else {
        console.warn("Failed to load db!");
    }

    // Load in services
    {
        const service_sources = [];
        try {
            for await (const dirEntry of Deno.readDir(service_folder)) {
                service_sources.push(dirEntry.name);
            }
        } catch (error) {
            console.warn("Could not read services folder:", error);
        }

        await Promise.all(
            service_sources.map(async source => {
                // there are 2 ways to make a valid service:
                // - my-verification.service.ts
                // - my-folder
                //    L index.ts
                //    L a.ts
                //    L service.ts <--
                const service_path = new URL(`./${source}`, service_folder);
                let stats;
                try {
                    stats = await Deno.stat(service_path);
                } catch {
                    return undefined;
                }

                let resolved_path: string;
                if (stats.isDirectory) {
                    const serviceFileUrl = new URL("./service.ts", service_path.href + "/");
                    try {
                        await Deno.stat(serviceFileUrl);
                        resolved_path = serviceFileUrl.href;
                    } catch {
                        return undefined; // Skip if no service.ts file is found in the directory
                    }
                } else if (service_path.href.endsWith(".ts")) {
                    resolved_path = service_path.href;
                } else {
                    return undefined;
                }

                // TODO: USE ZOD OR SOME DYNAMIC TYPE VALIDATOR!!!
                try {
                    const service_factory: Service.Service = (await import(resolved_path)).default;
                    if (!service_factory || typeof service_factory !== 'object' || !service_factory.name) {
                        console.warn(`Service at ${resolved_path} does not export a valid service object`);
                        return undefined;
                    }
                    if (!(await service_factory.validate(client))) {
                        return undefined;
                    }
                    if (service_factory.commands !== undefined) {
                        const validated_commands = await Promise.all(
                            service_factory.commands.map(async command => {
                                const validated = await command.validate(client);
                                return validated ? command : null;
                            }),
                        );
                        service_factory.commands = validated_commands.filter((command): command is Service.Command => command !== null);
                    }
                    if (service_factory.events !== undefined) {
                        const validated_events = await Promise.all(
                            service_factory.events.map(async event => {
                                const validated = await event.validate(client);
                                return validated ? event : null;
                            }),
                        );
                        service_factory.events = validated_events.filter((service): service is Service.Event<unknown[]> => service !== null);
                    }
                    console.log(`Loaded service: ${service_factory.name}`);
                    return service_factory;
                } catch (error) {
                    console.error(`Failed to load service from ${resolved_path}: ${error}`);
                    return undefined;
                }
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

    // Load service events
    for (const [_, service] of client.services) {
        if (!service.events) continue;
        service.events.map(event => {
            const method = event.once ? "once" : "on";
            // Use the function application method to correctly apply event listeners
            event.run_on.map(run_on => {
                client[method](run_on, async (...args: unknown[]) => {
                    // The 'execute' function expects the event name as the first argument
                    // followed by the database instance 'db' and then any event arguments
                    return await (event as Service.Event<unknown[]>).execution(run_on, client, db, ...args);
                });
            });
        });
    }

    // Load in commands
    {
        // Iterate over every command/folder
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

        // Iterate over file in said folder
        for (const file of command_sources) {
            const command_path = new URL(`./${file}`, command_directory);
            const resolved_path = command_path.href;
            const command_factory = (await import(resolved_path)).default;
            // Set a new item in the Collection with the key as the command name and the value as the exported module
            if (typeof command_factory === "function") {
                const legacy_command: import("@/types.ts").Command | null = command_factory();
                if (legacy_command) {
                    // Convert legacy command to service command format
                    const service_command: Service.Command = {
                        data: legacy_command.data,
                        validate: () => Promise.resolve(true),
                        execution: async (_client: DiscordClient, interaction) => {
                            return await legacy_command.execute(interaction);
                        }
                    };
                    client.commands.set(service_command.data.name, service_command);
                }
            }
        }
    }

    // Load in events
    {
        const event_directory = new URL("./events/", import.meta.url);
        const event_files = [];
        try {
            for await (const dirEntry of Deno.readDir(event_directory)) {
                if (dirEntry.isFile && dirEntry.name.endsWith(".ts")) {
                    event_files.push(dirEntry.name);
                }
            }
        } catch (error) {
            console.warn("Could not read events folder:", error);
        }

        // Iterate over each event file
        for (const file of event_files) {
            // Import files' content
            const event_path = new URL(`./${file}`, event_directory);
            const resolved_path = event_path.href;
            const event: Event = (await import(resolved_path)).default;

            // Attach the event onto the client
            if (event.once) {
                client.once(event.name, (...args) => event.execute(client, ...args));
            } else {
                client.on(event.name, (...args) => event.execute(client, ...args));
            }
        }
    }

    client.on(Events.Error, error => {
        console.error(`An error occurred: ${error}`);
    });

    // Login using token
    await client.login(DISCORD_BOT_TOKEN);
}

console.log("Starting bot...");
main().catch(err => console.error(err));

// Handle graceful shutdown
async function gracefulShutdown() {
    console.log("Shutting down gracefully...");
    await cleanupPostHog();
    Deno.exit(0);
}

// Listen for shutdown signals
Deno.addSignalListener("SIGINT", gracefulShutdown);
Deno.addSignalListener("SIGTERM", gracefulShutdown);

// Handle unhandled exits
globalThis.addEventListener("beforeunload", async () => {
    await cleanupPostHog();
});
