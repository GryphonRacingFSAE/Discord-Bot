// Output the logs of the bots

import { CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "@/types.js";
import fs from "node:fs";

const LOG_PATH = "./bot-logs.txt";
const TEMP_LOG_PATH = "./bot-logs-temp.txt";

export default {
    data: new SlashCommandBuilder()
        .setName("logs")
        .setDescription("Get the next 4000 logs of the bot")
        .addIntegerOption(option => option.setName("position").setDescription("Beginning position to seek out logs").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog),
    async execute(interaction: CommandInteraction) {
        // Get position and next 4000 logs of the bot
        const logs = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, "utf-8").split(/\r?\n/) : [];
        const position = Math.min(Math.max((interaction.options.get("position")?.value as number) || 0, 0), logs.length - 1);
        const end_position = Math.min(position + 4000, logs.length - 1);

        const last_logs = logs.slice(position, end_position).join("\n");
        fs.writeFileSync(TEMP_LOG_PATH, last_logs); // Create temp file

        await interaction.reply({
            ephemeral: true,
            files: [TEMP_LOG_PATH],
        });

        fs.unlinkSync(TEMP_LOG_PATH); // Delete file
    },
} as Command;
