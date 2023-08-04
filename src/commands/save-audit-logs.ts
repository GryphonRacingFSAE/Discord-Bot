// Command to save audit logs from the past week
// Logs are saved to a file locally which is also posted to the channel
// Will run weekly, but can still be invoked manually by the user

import { CommandInteraction, Guild, SlashCommandBuilder, TextChannel } from "discord.js";
import type { Command } from "@/types.js";
import fs from "node:fs";
import path from "node:path";

export default {
    data: new SlashCommandBuilder()
        .setName("save-audit-logs")
        .setDescription("Save audit logs from the past week.")
        .addStringOption(option => option.setName("start-date").setDescription("The start date in the format YYYY-MM-DD.").setRequired(false)),

    async execute(interaction: CommandInteraction) {
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

        // Get the start date from the interaction options, if provided
        const start_date = interaction.options.get("start-date")?.value?.toString();

        // Call the function to save the audit logs, with interaction provided to indicate the manual scenario
        await saveAuditLogs(interaction, guild, start_date);
    },
} as Command;

export async function saveAuditLogs(interaction: CommandInteraction | null, guild: Guild, start_date?: string) {
    // Calculate the filtered start date based on the provided start date or default to one week ago
    let filtered_start_date: Date;
    if (start_date) {
        filtered_start_date = new Date(start_date);
    } else {
        filtered_start_date = new Date();
        filtered_start_date.setDate(filtered_start_date.getDate() - 6);
    }

    try {
        // Fetch the audit logs for the guild
        const audit_logs = await guild.fetchAuditLogs();
        const logs_in_range = audit_logs.entries.filter(entry => entry.createdAt > filtered_start_date);
        const logs_array = logs_in_range.reverse();

        // Create a directory to store the logs file
        const logs_dir = "./resources/logs";
        fs.mkdirSync(logs_dir, { recursive: true });

        // Get the start and end date strings for the file name
        const formatted_start_date = filtered_start_date.toISOString().slice(0, 10);
        const formatted_end_date = new Date().toISOString().slice(0, 10);

        // Create the file name and path
        const file_name = `${formatted_start_date}_${formatted_end_date}.json`;
        const file_path = path.join(logs_dir, file_name);

        // Write the logs to the file
        fs.writeFileSync(file_path, JSON.stringify(logs_array, null, 2));

        // If the command is run manually (interaction provided), reply with the audit logs file
        if (interaction) {
            await interaction.reply({
                content: `Audit logs from ${formatted_start_date} to ${formatted_end_date}:`,
                files: [file_path],
            });
        }
        // If the command is run automatically (no interaction provided), post the audit logs file to the "audit-logs" channel
        else {
            const channel = guild.channels.cache.find(ch => ch.name === "audit-logs") as TextChannel;
            if (channel) {
                await channel.send({
                    content: `Audit logs from ${formatted_start_date} to ${formatted_end_date}:`,
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
}
