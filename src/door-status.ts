import { Client, EmbedBuilder, TextChannel } from "discord.js";
import http from "node:http";

let last_update_time: number = 0;
let previous_door_state: boolean | null = null;

export async function initDoorStatus(client: Client) {
    // Get the Discord guild ID from environment variables
    const guild_id = process.env.DISCORD_GUILD_ID;

    // Get the guild using the provided ID
    const guild = client.guilds.cache.get(guild_id!);
    if (!guild) {
        console.error(`Cannot find guild with ID ${guild_id!}`);
        return;
    }

    // Find the channel named "shop-open" in the guild
    const channel = guild.channels.cache.find(ch => ch.name === "shop-open") as TextChannel | undefined;

    // Check if there have been no updates from the ESP32 for a minute
    setInterval(async () => {
        const current_time = Date.now();
        if (current_time - last_update_time > 5000) {
            console.log("Possible ESP32 connection issue...");
        }
        if (current_time - last_update_time > 60000) {
            if (previous_door_state !== null) {
                console.error("ESP32 disconnected!");
                if (channel) await sendDoorStatusMessage(channel, null);
                previous_door_state = null;
            }
        }
    }, 10000);

    // Set up the HTTP server to handle incoming requests
    const server = http.createServer(async (req, res) => {
        if (req.method === "POST" && req.url === "/update_door_status") {
            let body = "";

            // Read the request body
            req.on("data", chunk => {
                body += chunk.toString();
            });

            // Process the received data when the request ends
            req.on("end", async () => {
                // Parse the received JSON data
                const parsed_data = JSON.parse(body);

                // Update the last update time
                last_update_time = Date.now();

                // Compare the received state with the previous state
                const new_door_state = parsed_data.state;
                if (new_door_state !== previous_door_state) {
                    // Update door status message based on the received state
                    if (channel) await sendDoorStatusMessage(channel, new_door_state === 1);
                    previous_door_state = new_door_state;
                }

                // Respond to the request
                res.statusCode = 200;
                res.end();
            });
        } else {
            // Handle 404 for other requests
            res.statusCode = 404;
            res.end();
        }
    });

    // Start the HTTP server
    const PORT = 80;
    server.listen(PORT, () => {
        console.log(`HTTP server is running at`, server.address());
    });
}

async function sendDoorStatusMessage(channel: TextChannel, door_status: boolean | null) {
    try {
        // Fetch and delete all previous bot messages in the channel
        await channel.messages.fetch();
        const messages_to_delete = channel.messages.cache.filter(message => message.author.bot);
        await channel.bulkDelete(messages_to_delete);

        // Create an embed with the door status
        const embed = createDoorStatusEmbed(door_status);

        // Send the embed as a message
        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error("Error while sending the door status message:", error);
    }
}

function createDoorStatusEmbed(door_status: boolean | null): EmbedBuilder {
    // Determine the color and status text based on the state
    let status_text: string = "Unknown";
    let status_color: number = 0xcccccc;
    if (door_status != null) {
        status_text = door_status ? "Open" : "Closed";
        status_color = door_status ? 0x00ff00 : 0xff0000;
    }

    // Build the embed with the status information
    const status_embed = new EmbedBuilder()
        .setColor(status_color)
        .addFields(
            { name: "Shop Status", value: status_text },
            { name: "Last Updated", value: new Date().toLocaleString("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "numeric" }) },
            { name: "\u200B", value: "[Google Maps](https://goo.gl/maps/f17ShXLsfcKVjqaGA)" },
        )
        .setImage("https://i.imgur.com/uw8zfkV.png");

    return status_embed;
}
