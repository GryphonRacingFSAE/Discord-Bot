// Command to save audit logs from the past week
// Logs are saved to a file locally which is also posted to the channel
// Will run weekly, but can still be invoked manually by the user

import { CommandInteraction, Guild, SlashCommandBuilder, TextChannel } from "discord.js";
import { Command } from "../types.mjs";
import fs from "fs";
import path from "path";

export default {
    data: new SlashCommandBuilder().setName("save-audit-logs").setDescription("Save audit logs from the past week."),
    async execute(interaction) {
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply("This command can only be used in a server (guild).");
            return;
        }

        // Get the member who invoked the command and check if they have the required role
        const member = guild.members.cache.get(interaction.user.id);
        const required_role = guild.roles.cache.find(role => role.name === "Verified");

        if (!member || !required_role || !member.roles.cache.has(required_role.id)) {
            await interaction.reply("You don't have the required role to use this command.");
            return;
        }

        // Call the function to save the audit logs, with interaction provided to indicate the manual scenario
        await saveAuditLogs(interaction, guild);
    },
} as Command;

export async function saveAuditLogs(interaction: CommandInteraction | null, guild: Guild) {
    // Get the date from one week ago
    const week_ago = new Date();
    week_ago.setDate(week_ago.getDate() - 6);

    try {
        // Fetch the audit logs for the guild
        const audit_logs = await guild.fetchAuditLogs();
        const logs_in_range = audit_logs.entries.filter(entry => entry.createdAt > week_ago);
        const logs_array = logs_in_range.reverse();

        // Create a directory to store the logs file
        const logs_dir = path.join("__dirname", "..", "logs");
        fs.mkdirSync(logs_dir, { recursive: true });

        // Get the start and end date strings for the file name
        const start_date = week_ago.toISOString().slice(0, 10);
        const end_date = new Date().toISOString().slice(0, 10);

        // Create the file name and path
        const file_name = `${start_date}_${end_date}.json`;
        const file_path = path.join(logs_dir, file_name);

        // Write the logs to the file
        fs.writeFileSync(file_path, JSON.stringify(logs_array, null, 2));

        // If the command is run manually (interaction provided), reply with the audit logs file
        if (interaction) {
            await interaction.reply({
                content: `Audit logs from ${start_date} to ${end_date}:`,
                files: [file_path],
            });
        }
        // If the command is run automatically (no interaction provided), post the audit logs file to the "audit-logs" channel
        else {
            const channel = guild.channels.cache.find(ch => ch.name === "audit-logs") as TextChannel;
            if (channel) {
                await channel.send({
                    content: `Audit logs from ${start_date} to ${end_date}:`,
                    files: [file_path],
                });
            }
        }
    } catch (error) {
        console.error("Error saving audit logs:", error);
        // If the command is run manually (interaction provided), reply with an error message
        if (interaction) {
            await interaction.reply("An error occurred while saving audit logs.");
        }
    }
};
