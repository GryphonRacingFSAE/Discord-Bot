// Command to save audit logs from the past week
// Logs are saved to a file locally which is also posted to the channel
// Will run weekly, but can still be invoked manually by the user

import { SlashCommandBuilder } from "discord.js";
import { Command } from "../types.mjs";
import fs from "fs";

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
            const audit_logs = await guild.fetchAuditLogs({ limit: 100 });

            const log_string = audit_logs.entries
                .map(entry => {
                    const executor = entry.executor ? `${entry.executor.username} (${entry.executor.id})` : "Unknown Executor";
                    return `[${entry.createdAt.toISOString()}] ${executor}: ${entry.action}`;
                })
                .join("\n");

            fs.writeFileSync("audit_logs.txt", log_string);

            const channel = interaction.channel;
            if (!channel) {
                await interaction.reply("This command can only be used in a text channel.");
                return;
            }

            await channel.send({
                content: "Audit logs from the past week:",
                files: ["audit_logs.txt"],
            });

            await interaction.reply("Audit logs saved and posted in the channel.");
        } catch (error) {
            console.error("Error saving audit logs:", error);
            await interaction.reply("An error occurred while saving audit logs.");
        }
    },
} as Command;
