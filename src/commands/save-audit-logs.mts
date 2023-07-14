// Command to save audit logs from the past week
// Logs are saved to a file locally which is also posted to the channel
// Will run weekly, but can still be invoked manually by the user

import { SlashCommandBuilder } from "discord.js";
import { Command } from "../types.mjs";
import fs from "fs";

export default {
    data: new SlashCommandBuilder().setName("save-audit-logs").setDescription("Save audit logs from the past week."),
    async execute(interaction) {
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply("This command can only be used in a server (guild).");
            return;
        }

        try {
            const audit_logs = await guild.fetchAuditLogs({ limit: 100 });
            const logs_json = JSON.stringify(audit_logs.entries, null, 2);

            fs.writeFileSync("audit_logs.json", logs_json);

            const channel = interaction.channel;
            if (!channel) {
                await interaction.reply("This command can only be used in a text channel.");
                return;
            }

            await channel.send({
                content: "",
                files: ["audit_logs.json"],
            });

            await interaction.reply("Audit logs from the past week:");
        } catch (error) {
            console.error("Error saving audit logs:", error);
            await interaction.reply("An error occurred while saving audit logs.");
        }
    },
} as Command;
