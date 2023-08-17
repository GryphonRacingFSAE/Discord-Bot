// Output the logs of the bots

import { CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "@/types.js";
import fs from "node:fs";

const LOG_PATH = "./bot-logs.txt";

export default {
    data: new SlashCommandBuilder()
        .setName("logs")
        .setDescription("Get the most recent logs of the bot")
        .addIntegerOption(option => option.setName("start").setDescription("Beginning position to seek out logs")
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog),
    async execute(interaction: CommandInteraction) {
        // Get position and next 4000 logs of the bot
        if (fs.existsSync(LOG_PATH)) {
            const logs = fs.readFileSync(LOG_PATH, "utf-8").split(/\r?\n/);
            const start_position = Math.max(0, interaction.options.get("start")?.value as number | undefined ?? logs.length - 4001);
            const end_position = Math.max(logs.length - 1, 0);
            const temp_log_path = Date.now().toString() + ".txt"; // Use timestamp

            const last_logs = logs.slice(position, end_position).join("\n");
            fs.writeFileSync(temp_log_path, last_logs); // Create temp file

            await interaction.reply({
                ephemeral: true,
                files: [temp_log_path],
            });

            fs.unlinkSync(temp_log_path); // Delete file
        } else {
            await interaction.reply({ ephemeral: true, content: "Bot was not setup with logging." });
        }
    },
} as Command;
