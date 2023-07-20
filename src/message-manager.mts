// Main function that is responsible for removing / adding countdowns
// HOW COUNTDOWNS WORK:
// It's very shrimple, we serialize/deserialize a json dictionary containing the "Countdowns" struct
// Events are stored in a dictionary, with the key being the event name and value containing any other data about it

import fs from "node:fs";
import type { Client } from "discord.js";
import { TextChannel, Message, EmbedBuilder } from "discord.js";
import { ScheduledTask } from "node-cron";

export type CountdownMessageInput = {
    eventDate: Date;
    eventName: string;
    eventLink: string | null;
};

type Countdowns = {
    // Channel of countdown
    [channelId: string]: {
        messageId: string;
        events: {
            // Events of countdown
            [eventName: string]: {
                eventDate: Date; // Date of countdown
                eventLink: string; // Any link if given
            };
        };
    };
};

// Deserialize messages
const messageDictionary: Countdowns = fs.existsSync("./messages.json")
    ? JSON.parse(fs.readFileSync("./messages.json", "utf8"), (key, value) => {
          if (key === "eventDate") {
              return new Date(value);
          }
          return value;
      })
    : {};

// Function to write current message dictionary info to file
const updateMessageDictionary = () => {
    fs.writeFileSync("./messages.json", JSON.stringify(messageDictionary));
};

export const updateMessage = async (
    client: Client,
    channel_id: string,
    terminate_on_message_destruction: boolean, // Destruct task if message is gone
    force_new_message: boolean, // Forcefully create a new message
    task: ScheduledTask | null = null,
) => {
    const channel = client.channels.cache.get(channel_id) as TextChannel;
    if (!messageDictionary[channel_id]) {
        return;
    }
    const now = new Date();
    const fields: { name: string; value: string }[] = [];
    if (Object.keys(messageDictionary[channel_id].events).length == 0) {
        // Message has no events so delete it
        try {
            await channel.messages.delete(messageDictionary[channel_id].messageId);
        } catch (error) {
            console.log(`Failed to find countdown message: ${error}`);
        } finally {
            delete messageDictionary[channel_id];
            updateMessageDictionary();
        }
        return;
    }

    // Iterate through each countdown and add a field with proper formatting to indicate time
    for (const countdownName in messageDictionary[channel_id].events) {
        const countdown = messageDictionary[channel_id].events[countdownName];
        const deltaTime = countdown.eventDate.getTime() - now.getTime();
        const event_locale = countdown.eventDate.toLocaleDateString(`en-CA`, { year: `numeric`, month: `long`, day: `numeric` });
        if (deltaTime <= 0) {
            fields.push({ name: countdownName, value: `${event_locale}\n**This event has already started**` });
        } else {
            let timeLeft;
            const deltaSeconds = deltaTime / 1000;
            const deltaMinutes = deltaSeconds / 60;
            const deltaHours = deltaMinutes / 60;
            const deltaDays = deltaHours / 24;
            const deltaWeeks = deltaDays / 7;
            const deltaMonths = deltaDays / 30;

            if (deltaMonths > 2) {
                timeLeft = Math.round(deltaMonths) + " month(s)";
            } else if (deltaWeeks > 2) {
                timeLeft = Math.round(deltaWeeks) + " week(s)";
            } else if (deltaDays > 3) {
                timeLeft = Math.round(deltaDays) + " day(s)";
            } else {
                timeLeft = deltaHours + " hour(s)";
            }

            fields.push({ name: `${countdownName}`, value: `[${event_locale}](${countdown.eventLink})\nTime remaining: ${timeLeft}` });
        }
    }

    // Create embedded message
    let message: Message | undefined;
    const embedded = new EmbedBuilder().setColor(`#FFC72A`).setFields(fields).setTimestamp().setFooter({ text: "Off to the races!" });

    // Retrive message if one was not found, try to make a new one if the proper flags have been enabled
    try {
        message = await channel.messages.fetch(messageDictionary[channel_id].messageId);
        await message.edit({ embeds: [embedded] });
    } catch {
        // Message does not exist. It has been destroyed :(
        if (terminate_on_message_destruction && task) {
            task.stop();
            return;
        } else if (!terminate_on_message_destruction) {
            message = await channel.send({ embeds: [embedded] });
            messageDictionary[channel_id].messageId = message.id;
            updateMessageDictionary();
        }
    }

    // If the message is older than 24 hours, delete and make a new one
    if ((message && now.getTime() - message.createdAt.getTime() >= 1000 * 60 * 60 * 12) || force_new_message) {
        if (message) {
            await message.delete();
        }
        message = await channel.send({ embeds: [embedded] });
        messageDictionary[channel_id].messageId = message.id;
        updateMessageDictionary();
    }
};

// Adds a countdown
export const addCountdown = (client: Client, channelId: string, messageInput: CountdownMessageInput) => {
    if (!messageDictionary[channelId]) {
        messageDictionary[channelId] = {
            messageId: "",
            events: {},
        };
    }
    messageDictionary[channelId].events[messageInput.eventName] = {
        eventDate: messageInput.eventDate,
        eventLink: messageInput.eventLink === null ? "https://www.youtube.com/watch?v=dQw4w9WgXcQ" : messageInput.eventLink,
    };
    updateMessageDictionary();
};

// Removes a countdown
export const deleteCountdown = (client: Client, channelId: string, eventName: string) => {
    if (!messageDictionary[channelId] || !messageDictionary[channelId].events[eventName]) {
        return;
    }
    delete messageDictionary[channelId].events[eventName];
    updateMessageDictionary();
};
