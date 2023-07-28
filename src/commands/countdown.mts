// A countdown timer that tries to stay as recent as possible as well
// updates the message every couple of minutes
import { CommandInteractionOptionResolver, SlashCommandBuilder } from "discord.js";
import { Command } from "../types.mjs";
import * as cron from "node-cron";
import type { CountdownMessageInput } from "../countdown-manager.mjs";
import { addCountdown, deleteCountdown, updateMessage } from "../countdown-manager.mjs";

export default {
    data: new SlashCommandBuilder()
        .setName("countdown")
        .setDescription("Commands regarding a countdown")
        .addSubcommand(sub_command =>
            sub_command
                .setName("add")
                .setDescription("Start the countdown!")
                .addStringOption(option => option.setName("date").setDescription("Date of the event in YYYY/MM/DD format").setRequired(true))
                .addStringOption(option => option.setName("name").setDescription("Name of the event").setRequired(true))
                .addStringOption(option => option.setName("url").setDescription("Optional URL of the event").setRequired(false)),
        )
        .addSubcommand(sub_command =>
            sub_command
                .setName("remove")
                .setDescription("Remove a countdown!")
                .addStringOption(option => option.setName("name").setDescription("Name of the event").setRequired(true)),
        ),
    async execute(interaction) {
        {
            // Determine permission to use
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
                const date_string = options.get("date")?.value?.toString();
                const event_name = options.get("name")?.value?.toString();
                const event_link = options.get("url")?.value?.toString();
                if (date_string === undefined && event_name === undefined) {
                    // This shouldn't be possible as we set those two a requirements
                    return;
                }
                // https://developers.redhat.com/articles/2022/10/13/advanced-regex-capture-groups-lookaheads-and-lookbehinds
                // Match the date of
                const match = date_string?.match(new RegExp("^([0-9]{4})/([0-9]{2})/([0-9]{2})$"));
                if (match === null) {
                    await interaction.reply({
                        content: "Invalid date format. Please use YYYY/MM/DD format",
                        ephemeral: true,
                    });
                    return;
                }
                const [year, month, day] = [match![1], match![2], match![3]];
                const date = new Date(Number(year), Number(month) - 1, Number(day));
                if (date.getTime() - Date.now() <= 0) {
                    // All countdowns must be in the future
                    await interaction.reply({ content: "Date specified should be in the future", ephemeral: true });
                    return;
                }

                const message_input: CountdownMessageInput = {
                    event_date: date,
                    event_name: event_name as string,
                    event_link: typeof event_link !== "undefined" ? event_link : null,
                };
                addCountdown(interaction.client, interaction.channelId, message_input);
                updateMessage(interaction.client, interaction.channelId, true, true, null).then(() => {
                    // Update the message each time every 5 minutes
                    const task = cron.schedule("*/5 * * * *", () => updateMessage(interaction.client, interaction.channelId, true, false, task));
                    task.start();
                });
                await interaction.reply({ content: "Countdown successfully added", ephemeral: true });
                break;
            }
            case "remove": {
                const event_name = options.get("name")?.value?.toString();
                if (event_name === undefined) {
                    // This shouldn't be possible as we set those two a requirements
                    return;
                }
                deleteCountdown(interaction.client, interaction.channelId, event_name);
                updateMessage(interaction.client, interaction.channelId, true, true, null).then(() => {
                    // Update message every 5 minute. We cannot assume a cron schedule
                    // exists already
                    const task = cron.schedule("*/5 * * * *", () => updateMessage(interaction.client, interaction.channelId, true, false, task));
                    task.start();
                });
                await interaction.reply({ content: "Countdown removed", ephemeral: true });
                break;
            }
        }
    },
} as Command;
