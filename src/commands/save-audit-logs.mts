// Command to save audit logs from the past week
// Logs are saved to a file locally which is also posted to the channel
// Will run weekly, but can still be invoked manually by the user

import { SlashCommandBuilder } from "discord.js";
import { Command } from "../types.mjs";
import fs from "fs";
import path from "path";

export default {
    data: new SlashCommandBuilder().setName("save-audit-logs").setDescription("Save audit logs from the past week."),
    async execute(interaction) {
        const week_ago = new Date();
        week_ago.setDate(week_ago.getDate() - 7);

        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply("This command can only be used in a server (guild).");
            return;
        }

        try {
            const audit_logs = await guild.fetchAuditLogs();
            const logs_in_range = audit_logs.entries.filter(entry => entry.createdAt > week_ago);
            const logs_array = logs_in_range.reverse();

            const logs_dir = path.join("__dirname", "..", "logs");
            fs.mkdirSync(logs_dir, { recursive: true });

            const start_date = week_ago.toISOString().slice(0, 10);
            const end_date = new Date().toISOString().slice(0, 10);

            const file_name = `${start_date}_${end_date}.json`;
            const file_path = path.join(logs_dir, file_name);

            fs.writeFileSync(file_path, JSON.stringify(logs_array, null, 2));

            const channel = interaction.channel;
            if (!channel) {
                await interaction.reply("This command can only be used in a text channel.");
                return;
            }

            await channel.send({
                content: "",
                files: [file_path],
            });

            await interaction.reply(`Audit logs from ${start_date} to ${end_date}:`);
        } catch (error) {
            console.error("Error saving audit logs:", error);
            await interaction.reply("An error occurred while saving audit logs.");
        }
    },
} as Command;
