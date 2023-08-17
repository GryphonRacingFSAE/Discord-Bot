import { EmbedBuilder, Message, TextChannel } from "discord.js";
import persist from "node-persist";

const storage_key = "door_status";

let last_message_id: string | null = null;

export async function initializeDoorStatusMessage(channel: TextChannel) {
    const existing_message = (await persist.getItem(storage_key)) as Message | null;
    if (existing_message) {
        const message = await channel.messages.fetch(existing_message.id);
        if (message) {
            last_message_id = message.id;
        }
    }
}

export async function updateDoorStatusMessage(channel: TextChannel, state: boolean) {
    try {
        if (last_message_id) {
            const existing_message = await channel.messages.fetch(last_message_id);
            if (existing_message) {
                await existing_message.delete();
            }
        }

        const embed = createDoorStatusEmbed(state);
        const message = await channel.send({ embeds: [embed] });

        last_message_id = message.id;
        await persist.setItem(storage_key, { id: message.id });
    } catch (error) {
        console.error("Error while updating the door status message:", error);
    }
}

function createDoorStatusEmbed(state: boolean): EmbedBuilder {
    const status_color = state ? 0x00ff00 : 0xff0000;
    const status_text = state ? "Open" : "Closed";

    const status_embed = new EmbedBuilder()
        .setColor(status_color)
        .addFields(
            { name: "Shop Status", value: status_text },
            { name: "Last Updated", value: new Date().toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "numeric" }) },
        );

    return status_embed;
}
