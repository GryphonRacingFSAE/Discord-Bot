// A countdown timer that tries to stay as recent as possible as well
// updates the message every couple of minutes
import { SlashCommandBuilder } from "discord.js";
import { Command } from "../types.mjs";
import * as cron from "node-cron";
import { deleteCountdown, updateMessage } from "../messageManager.mjs";

export default {
    data: new SlashCommandBuilder()
        .setName("remove_countdown")
        .setDescription("Remove a countdown!")
        .addStringOption(option => option.setName("name").setDescription("Name of the event").setRequired(true)),
    async execute(interaction) {
        const options = interaction.options;
        const eventName = options.get("name")?.value?.toString();
        if (eventName === undefined) {
            // This shouldn't be possible as we set those two a requirements
            return;
        }
        deleteCountdown(interaction.client, interaction.channelId, eventName);
        updateMessage(interaction.client, interaction.channelId,  false, true, null).then(() => {
            const task = cron.schedule("*/5 * * * *", () => updateMessage(interaction.client, interaction.channelId, true, false, task));
            task.start();
        });
        await interaction.reply({ content: "Countdown removed", ephemeral: true });
    },
} as Command;
