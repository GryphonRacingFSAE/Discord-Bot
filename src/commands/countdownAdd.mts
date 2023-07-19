// A countdown timer that tries to stay as recent as possible as well
// updates the message every couple of minutes
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Command } from "../types.mjs";
import * as cron from "node-cron";
import type { CountdownMessageInput } from "../messageManager.mjs";
import { addCountdown, updateMessage } from "../messageManager.mjs";

export default {
    data: new SlashCommandBuilder()
        .setName("add_countdown")
        .setDescription("Start the countdown!")
        .addStringOption(option => option.setName("date").setDescription("Date of the event in YYYY/MM/DD format").setRequired(true))
        .addStringOption(option => option.setName("name").setDescription("Name of the event").setRequired(true))
        .addStringOption(option => option.setName("url").setDescription("Optional URL of the event").setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
        const options = interaction.options;
        const dateString = options.get("date")?.value?.toString();
        const eventName = options.get("name")?.value?.toString();
        const eventLink = options.get("url")?.value?.toString();
        if (dateString === undefined && eventName === undefined) {
            // This shouldn't be possible as we set those two a requirements
            return;
        }
        console.log(dateString);
        const match = dateString?.match(/\b(\d{4})\/(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\b/g);
        if (match === null) {
            await interaction.reply({ content: "Invalid date format. Please use YYYY/MM/DD format", ephemeral: true });
            return;
        }
        const [year, month, day] = match![0].split("/");
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        if (date.getTime() - new Date().getTime() > 0) {
            const messageInput: CountdownMessageInput = {
                eventDate: date,
                eventName: eventName as string,
                eventLink: typeof eventLink !== "undefined" ? eventLink : null,
            };
            addCountdown(interaction.client, interaction.channelId, messageInput);
            updateMessage(interaction.client, interaction.channelId, false, true, null).then(() => {
                const task = cron.schedule("*/5 * * * *", () => updateMessage(interaction.client, interaction.channelId, true, false, task));
                task.start();
            });
            await interaction.reply({ content: "Countdown added", ephemeral: true });
        } else {
            // All countdowns must be in the future
            await interaction.reply({ content: "Date specified should be in the future", ephemeral: true });
        }
        //await interaction.reply(test_1.toString());
    },
} as Command;
