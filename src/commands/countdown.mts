// A countdown timer that tries to stay as recent as possible as well
// updates the message every couple of minutes
import { CommandInteractionOptionResolver, SlashCommandBuilder } from "discord.js";
import { Command } from "../types.mjs";
import * as cron from "node-cron";
import type { CountdownMessageInput } from "../message-manager.mjs";
import { addCountdown, deleteCountdown, updateMessage } from "../message-manager.mjs";

export default {
    data: new SlashCommandBuilder()
        .setName("countdown")
        .setDescription("Commands regarding a countdown")
        .addSubcommand(subCommand =>
            subCommand
                .setName("add")
                .setDescription("Start the countdown!")
                .addStringOption(option => option.setName("date").setDescription("Date of the event in YYYY/MM/DD format").setRequired(true))
                .addStringOption(option => option.setName("name").setDescription("Name of the event").setRequired(true))
                .addStringOption(option => option.setName("url").setDescription("Optional URL of the event").setRequired(false)),
        )
        .addSubcommand(subCommand =>
            subCommand
                .setName("remove")
                .setDescription("Remove a countdown!")
                .addStringOption(option => option.setName("name").setDescription("Name of the event").setRequired(true)),
        ),
    async execute(interaction) {
        // Get permissions
        {
            const guild = interaction.guild;
            if (!guild) {
                await interaction.reply({ content: "This command can only be used in a server (guild)", ephemeral: true });
                return;
            }
            const member = guild.members.cache.get(interaction.user.id);
            const captain_role = guild.roles.cache.find(role => role.name === "Captain");
            const lead_role = guild.roles.cache.find(role => role.name === "Leads");
            if (!member || !captain_role || !lead_role || !(member.roles.cache.has(captain_role.id) || member.roles.cache.has(lead_role.id))) {
                await interaction.reply({ content: "You do not have the necessary permissions to use this command", ephemeral: true });
                return;
            }
        }
        const options = interaction.options as CommandInteractionOptionResolver;
        switch (options.getSubcommand()) {
            case "add": {
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
                    await interaction.reply({
                        content: "Invalid date format. Please use YYYY/MM/DD format",
                        ephemeral: true,
                    });
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
                break;
            }
            case "remove": {
                const eventName = options.get("name")?.value?.toString();
                if (eventName === undefined) {
                    // This shouldn't be possible as we set those two a requirements
                    return;
                }
                deleteCountdown(interaction.client, interaction.channelId, eventName);
                updateMessage(interaction.client, interaction.channelId, false, true, null).then(() => {
                    const task = cron.schedule("*/5 * * * *", () => updateMessage(interaction.client, interaction.channelId, true, false, task));
                    task.start();
                });
                await interaction.reply({ content: "Countdown removed", ephemeral: true });
                break;
            }
        }
    },
} as Command;
