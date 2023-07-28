// Main function that is responsible for removing / adding countdowns
// HOW COUNTDOWNS WORK:
// It's very shrimple, we serialize/deserialize a json dictionary containing the "Countdowns" struct
// Events are stored in a dictionary, with the key being the event name and value containing any other data about it

import fs from "node:fs";
import type { Client } from "discord.js";
import { TextChannel, Message, EmbedBuilder } from "discord.js";
import { ScheduledTask } from "node-cron";

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

// Deserialize messages
const message_dictionary: Countdowns = fs.existsSync("./messages.json")
    ? JSON.parse(fs.readFileSync("./messages.json", "utf8"), (key, value) => {
          if (key === "event_date") {
              return new Date(value);
          }
          return value;
      })
    : {};

// Function to write current message dictionary info to file
function updateMessageDictionary() {
    fs.writeFileSync("./messages.json", JSON.stringify(message_dictionary));
}

export async function updateMessage(
    client: Client,
    channel_id: string,
    terminate_on_message_destruction: boolean, // Destruct task if message is gone
    force_new_message: boolean, // Forcefully create a new message
    task: ScheduledTask | null = null,
) {
    const channel = client.channels.cache.get(channel_id) as TextChannel;
    if (!message_dictionary[channel_id]) {
        return;
    }
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
            updateMessageDictionary();
        }
        return;
    }

    // Iterate through each countdown and add a field with proper formatting to indicate time
    for (const countdown_name in message_dictionary[channel_id].events) {
        const countdown = message_dictionary[channel_id].events[countdown_name];
        const delta_time = countdown.event_date.getTime() - now.getTime();
        const event_locale = countdown.event_date.toLocaleDateString(`en-CA`, { year: `numeric`, month: `long`, day: `numeric` });
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
                time_left = Math.round(delta_days) + " day(s)";
            } else {
                time_left = delta_hours + " hour(s)";
            }

            fields.push({ name: `${countdown_name}`, value: `[${event_locale}](${countdown.event_link})\nTime remaining: ${time_left}` });
        }
    }
    updateMessageDictionary();

    // Create embedded message
    let message: Message | undefined;
    const embedded = new EmbedBuilder().setColor(`#FFC72A`).setFields(fields).setTimestamp().setFooter({ text: "Off to the races!" });

    // Retrieve message if one was not found, try to make a new one if the proper flags have been enabled
    try {
        message = await channel.messages.fetch(message_dictionary[channel_id].message_id);
        await message.edit({ embeds: [embedded] });
    } catch {
        // Message does not exist. It has been destroyed :(
        if (terminate_on_message_destruction && task) {
            task.stop();
            return;
        } else if (!terminate_on_message_destruction) {
            message = await channel.send({ embeds: [embedded] });
            message_dictionary[channel_id].message_id = message.id;
            updateMessageDictionary();
        }
    }

    // If the message is older than 24 hours, delete and make a new one
    // or if the force_new_message flag is enabled
    if ((message !== undefined && now.getTime() - message.createdTimestamp >= 1000 * 60 * 60 * 24) || force_new_message) {
        if (message) {
            await message.delete();
        }
        message = await channel.send({ embeds: [embedded] });
        message_dictionary[channel_id].message_id = message.id;
        updateMessageDictionary();
    }
}

// Adds a countdown
export function addCountdown(client: Client, channelId: string, messageInput: CountdownMessageInput) {
    if (!message_dictionary[channelId]) {
        message_dictionary[channelId] = {
            message_id: "",
            events: {},
        };
    }
    message_dictionary[channelId].events[messageInput.event_name] = {
        event_date: messageInput.event_date,
        event_link: messageInput.event_link === null ? "https://www.youtube.com/watch?v=dQw4w9WgXcQ" : messageInput.event_link,
    };
    updateMessageDictionary();
}

// Removes a countdown
export function deleteCountdown(client: Client, channelId: string, eventName: string) {
    if (!message_dictionary[channelId] || !message_dictionary[channelId].events[eventName]) {
        return;
    }
    delete message_dictionary[channelId].events[eventName];
    updateMessageDictionary();
}
