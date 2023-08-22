import { EmbedBuilder, Message, TextChannel } from "discord.js";
import persist from "node-persist";

// Key to store the last message ID in local storage
const storage_key = "door_status";

let last_message_id: string | null = null;

export async function initializeDoorStatusMessage(channel: TextChannel) {
    // Fetch the last message ID from local storage
    const existing_message = (await persist.getItem(storage_key)) as Message | null;
    if (existing_message) {
        // Fetch the message using the stored ID
        const message = await channel.messages.fetch(existing_message.id);
        if (message) {
            // Store the fetched message's ID
            last_message_id = message.id;
        }
    }
}

export async function updateDoorStatusMessage(channel: TextChannel, is_door_open: boolean) {
    try {
        // Check if there's a previous message
        if (last_message_id) {
            // Fetch the previous message using the stored ID
            const existing_message = await channel.messages.fetch(last_message_id);
            if (existing_message) {
                // Delete the previous message
                await existing_message.delete();
            }
        }

        // Create an embed with the updated door status
        const embed = createDoorStatusEmbed(is_door_open);

        // Send the embed as a new message
        const message = await channel.send({ embeds: [embed] });

        // Update the last_message_id variable with the new message's ID
        last_message_id = message.id;

        // Store the new message ID in local storage
        await persist.setItem(storage_key, { id: message.id });
    } catch (error) {
        console.error("Error while updating the door status message:", error);
    }
}

function createDoorStatusEmbed(is_door_open: boolean): EmbedBuilder {
    // Determine the color and status text based on the state
    const status_color = is_door_open ? 0x00ff00 : 0xff0000;
    const status_text = is_door_open ? "Open" : "Closed";

    // Build the embed with the status information
    const status_embed = new EmbedBuilder()
        .setColor(status_color)
        .addFields(
            { name: "Shop Status", value: status_text },
            { name: "Last Updated", value: new Date().toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "numeric" }) },
            { name: "\u200B", value: "[Google Maps](https://goo.gl/maps/f17ShXLsfcKVjqaGA)" },
        )
        .setImage("https://i.imgur.com/uw8zfkV.png");

    return status_embed;
}
