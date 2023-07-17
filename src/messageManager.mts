// Define all necessary types usage
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
    [channelId: string]: {
        messageId: string;
        events: {
            [eventName: string]: {
                eventDate: Date;
                eventLink: string;
            };
        };
    };
};

// Manages message editing + deleting and updating
const messageDictionary: Countdowns = fs.existsSync("./messages.json")
    ? JSON.parse(fs.readFileSync("./messages.json", "utf8"), (key, value) => {
          if (key === "eventDate") {
              return new Date(value);
          }
          return value;
      })
    : {};

// Function to write current message info to file
const updateMessageDictionary = () => {
    fs.writeFileSync("./messages.json", JSON.stringify(messageDictionary));
};

export const updateMessage = async (
    client: Client,
    channelId: string,
    terminate_on_message_destruction: boolean, // Destruct task if message is gone
    force_new_message: boolean, // Forcefully create a new message
    task: ScheduledTask | null = null,
) => {
    const channel = client.channels.cache.get(channelId) as TextChannel;
    if (!messageDictionary[channelId]) {
        return;
    }
    const now = new Date();
    const fields: { name: string; value: string }[] = [];
    for (const countdownName in messageDictionary[channelId].events) {
        const countdown = messageDictionary[channelId].events[countdownName];
        let deltaTime = countdown.eventDate.getTime() - now.getTime();
        const event_locale = countdown.eventDate.toLocaleDateString(`en-CA`, { year: `numeric`, month: `long`, day: `numeric` });
        if (deltaTime <= 0) {
            fields.push({ name: countdownName, value: `${event_locale}\n**This event has already started**` });
        } else {
            deltaTime = Math.round((deltaTime / (1000 * 60 * 60 * 24)) * 100) / 100;
            fields.push({ name: `${countdownName}`, value: `[${event_locale}](${countdown.eventLink})\nTime remaining: ${deltaTime} day(s)` });
        }
    }

    let message: Message | undefined;
    const embedded = new EmbedBuilder()
        .setColor(`#FFC72A`)
        .setTitle("Race countdown")
        .setAuthor({ name: "Gryphon Racing" })
        .setDescription(`Countdowns to certain events.`)
        .setFields(fields)
        .setTimestamp()
        .setFooter({ text: "Off to the races!" });

    try {
        message = await channel.messages.fetch(messageDictionary[channelId].messageId);
        await message.edit({ embeds: [embedded] });
    } catch {
        // Message does not exist. It has been destroyed :(
        if (terminate_on_message_destruction && task) {
            task.stop();
            return;
        } else if (!terminate_on_message_destruction) {
            message = await channel.send({ embeds: [embedded] });
            messageDictionary[channelId].messageId = message.id;
            updateMessageDictionary();
        }
    }

    // If the message is older than 24 hours, delete and make a new one
    if ((message && now.getTime() - message.createdAt.getTime() >= 1000 * 60 * 60 * 12) || force_new_message) {
        if (message) {
            await message.delete();
        }
        message = await channel.send({ embeds: [embedded] });
        messageDictionary[channelId].messageId = message.id;
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

export const deleteCountdown = (client: Client, channelId: string, eventName: string) => {
    if (!messageDictionary[channelId] || !messageDictionary[channelId].events[eventName]) {
        return;
    }
    delete messageDictionary[channelId].events[eventName];
    updateMessageDictionary();
};
