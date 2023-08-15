// Output the logs of the bots

import { CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "@/types.js";
import fs from "node:fs";
import { EOL } from "os";

const LOG_PATH = "./bot-logs.txt";
const TEMP_LOG_PATH = "./bot-logs-temp.txt";

export default {
    data: new SlashCommandBuilder().setName("logs").setDescription("Get the last 4000 logs of the bot")
        .addIntegerOption(option => option.setName("position").setDescription("End position of the logs to seek from. i.e. 4000 inputted would mean logs would range from 0->4000").setRequired(true) )
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog),
    async execute(interaction: CommandInteraction) {
        let logs = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf-8').split(EOL) : [];
        const last_position = interaction.options.get("position")?.value! as number;
        const start = Math.max(last_position - 4000, 0);

        const last_logs = logs.slice(start, last_position).join(EOL);
        fs.writeFileSync(TEMP_LOG_PATH, last_logs); // Create temp file

        await interaction.reply({
            ephemeral: true,
            files: [TEMP_LOG_PATH]
        });

        fs.unlinkSync(TEMP_LOG_PATH); // Delete file
    },
} as Command;
