// Main function that is responsible for removing / adding countdowns
// HOW COUNTDOWNS WORK:
// It's very shrimple, we serialize/deserialize a json dictionary containing the "Countdowns" struct
// Events are stored in a dictionary, with the key being the event name and value containing any other data about it

import fs from "node:fs";
import type { Client } from "discord.js";
import { TextChannel, Message, EmbedBuilder } from "discord.js";
import { ScheduledTask } from "node-cron";
import { Mutex } from "async-mutex";

export type CountdownMessageInput = {
    event_date: Date;
    event_name: string;
    event_link: string | null;
};

type Countdowns = {
    // Channel of countdown
    [channel_id: string]: {
        message_id: string;
        events: {
            // Events of countdown
            [event_name: string]: {
                event_date: Date; // Date of countdown
                event_link: string; // Any link if given
            };
        };
    };
};

const RUNNING_TASKS = new Set<string>(); // Prevent cron from re-running tasks too close together

// Deserialize messages
const FILE_RW = new Mutex();
const message_dictionary: Countdowns = await FILE_RW.runExclusive(async () => {
    try {
        await fs.promises.access("./resources/messages.json");
        const fileContent = await fs.promises.readFile("./resources/messages.json", "utf8");
        return JSON.parse(fileContent, (key, value) => {
            if (key === "event_date") {
                return new Date(value);
            }
            return value;
        });
    } catch (error) {
        await fs.promises.writeFile("./messages.json", JSON.stringify({}), "utf8");
        return {};
    }
});

// Function to write current message dictionary info to file
function updateMessageDictionary() {
    return FILE_RW.runExclusive(async () => {
        await fs.promises.writeFile("./resources/messages.json", JSON.stringify(message_dictionary));
    });
}

// Get # of messages between the given message and the most recent. Max is 100.
async function getMessagesBetween(original_message: Message, channel: TextChannel): Promise<number> {
    const messages = await channel.messages.fetch({ limit: 100 });
    let count = 0;
    for (const [, message] of messages) {
        if (message.id == original_message.id) {
            return count;
        }
        count++;
    }
    return count;
}

export async function updateMessage(
    client: Client,
    channel_id: string,
    terminate_on_message_destruction: boolean, // Destruct task if message is gone
    force_new_message: boolean, // Forcefully create a new message
    task: ScheduledTask | null = null,
) {
    console.log("Updating countdown message...");

    const channel = client.channels.cache.get(channel_id) as TextChannel;
    if (!message_dictionary[channel_id] || RUNNING_TASKS.has(channel_id)) {
        return;
    }
    RUNNING_TASKS.add(channel_id);
    const now = new Date();
    const fields: { name: string; value: string }[] = [];
    if (Object.keys(message_dictionary[channel_id].events).length == 0) {
        // Message has no events so delete it
        try {
            await channel.messages.delete(message_dictionary[channel_id].message_id);
        } catch (error) {
            console.log(`Failed to find countdown message: ${error}`);
        } finally {
            delete message_dictionary[channel_id];
            await updateMessageDictionary();
        }
        return;
    }
    {
        // Sort countdowns based on what is newest
        const countdown_events = [];
        for (const countdown_name in message_dictionary[channel_id].events) {
            const countdown = message_dictionary[channel_id].events[countdown_name];
            const delta_time = countdown.event_date.getTime() - now.getTime();
            countdown_events.push({
                name: countdown_name,
                event: countdown,
                delta_time,
            });
        }
        // Sort newest first
        countdown_events.sort((a, b) => a.delta_time - b.delta_time);

        // Iterate through each countdown and add a field with proper formatting to indicate time
        for (const { name, event, delta_time } of countdown_events) {
            const event_locale = event.event_date.toLocaleDateString(`en-CA`, {
                year: `numeric`,
                month: `long`,
                day: `numeric`,
            });
            if (delta_time <= 0) {
                // Remove any events that have already happened
                delete message_dictionary[channel_id];
                //fields.push({ name: countdown_name, value: `${event_locale}\n**This event has already started**` });
            } else {
                let time_left;
                const delta_seconds = delta_time / 1000;
                const delta_minutes = delta_seconds / 60;
                const delta_hours = delta_minutes / 60;
                const delta_days = delta_hours / 24;
                const delta_weeks = delta_days / 7;
                const delta_months = delta_days / 30;

                if (delta_months > 2) {
                    time_left = Math.round(delta_months) + " month(s)";
                } else if (delta_weeks > 2) {
                    time_left = Math.round(delta_weeks) + " week(s)";
                } else if (delta_days > 3) {
                    time_left = Math.round(delta_days * 10) / 10 + " day(s)";
                } else {
                    time_left = Math.round(delta_hours * 10000) / 10000 + " hour(s)";
                }

                fields.push({
                    name: `${name}`,
                    value: `[${event_locale}](${event.event_link})\nTime remaining: ${time_left}`,
                });
            }
        }
    }
    await updateMessageDictionary();

    // Create embedded message
    let message: Message | null = null;
    const embedded = new EmbedBuilder().setColor(`#FFC72A`).setFields(fields).setTimestamp().setFooter({ text: "Off to the races!" });

    // Retrieve message if one was not found, try to make a new one if the proper flags have been enabled
    try {
        message = await channel.messages.fetch(message_dictionary[channel_id].message_id);
        if (message) {
            message = await message.edit({ embeds: [embedded] });
        }
    } catch (error) {
        if (error instanceof Error) {
            console.log("Error while fetching/editing message:", error.message);

            if (error.message.includes("Unknown Message") || error.message === "Missing Access") {
                // Handle unknown message error separately if needed.
                console.log("The message was not found.");

                if (terminate_on_message_destruction && task) {
                    RUNNING_TASKS.delete(channel_id);
                    task.stop();
                    return; // Exit function early if the task is stopped due to this error
                }
            }

            if (!terminate_on_message_destruction) {
                try {
                    console.log("Generating emergency message");
                    message = await channel.send({ embeds: [embedded] });
                    message_dictionary[channel_id].message_id = message.id;
                    await updateMessageDictionary();
                } catch (sendError) {
                    if (sendError instanceof Error) {
                        console.error("Could not send a new message:", sendError.message);
                    }
                }
            }
        }
    }

    // If the message is older than 24 hours, delete and make a new one
    // or if the force_new_message flag is enabled
    try {
        if (
            (message !== null &&
                (now.getTime() - message.createdTimestamp >= 1000 * 60 * 60 * 24 ||
                    (now.getTime() - message.createdTimestamp >= 1000 * 60 * 10 && (await getMessagesBetween(message, channel)) >= 100))) ||
            force_new_message
        ) {
            if (message) {
                await message.delete();
            }

            const new_message = await channel.send({ embeds: [embedded] });
            message_dictionary[channel_id].message_id = new_message.id;
            await updateMessageDictionary();
        }
    } catch (error) {
        console.error("Error during message handling:", message?.id, error);
    } finally {
        RUNNING_TASKS.delete(channel_id);
    }
}

export async function addCountdown(client: Client, channel_id: string, message_input: CountdownMessageInput) {
    if (!message_dictionary[channel_id]) {
        message_dictionary[channel_id] = {
            message_id: "",
            events: {},
        };
    }
    message_dictionary[channel_id].events[message_input.event_name] = {
        event_date: message_input.event_date,
        event_link: message_input.event_link === null ? "https://www.youtube.com/watch?v=dQw4w9WgXcQ" : message_input.event_link,
    };
    await updateMessageDictionary();
}

export async function deleteCountdown(client: Client, channel_id: string, event_name: string) {
    if (!message_dictionary[channel_id] || !message_dictionary[channel_id].events[event_name]) {
        return;
    }
    delete message_dictionary[channel_id].events[event_name];
    await updateMessageDictionary();
}
