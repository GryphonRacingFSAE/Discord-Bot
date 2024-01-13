// Output the logs of the bots

import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import type { Command } from "@/types.js";
import fs from "node:fs";

const LOG_PATH = "./bot-logs.txt";

export default function createCommand() {
    return {
        data: new SlashCommandBuilder()
            .setName("logs")
            .setDescription("Get the most recent logs of the bot")
            .addIntegerOption(option => option.setName("start").setDescription("Beginning position to seek out logs")),
        async execute(interaction: CommandInteraction) {
            {
                // Determine permission to use
                const guild = interaction.guild;
                if (!guild) {
                    await interaction.reply({
                        content: "This command can only be used in a server (guild)",
                        ephemeral: true,
                    });
                    return;
                }
                const member = guild.members.cache.get(interaction.user.id);
                const captain_role = guild.roles.cache.find(role => role.name === "Captain");
                const lead_role = guild.roles.cache.find(role => role.name === "Leads");
                const bot_manager_role = guild.roles.cache.find(role => role.name === "Bot Developer");
                if (
                    !member ||
                    (!(captain_role && member.roles.cache.has(captain_role.id)) &&
                        !(lead_role && member.roles.cache.has(lead_role.id)) &&
                        !(bot_manager_role && member.roles.cache.has(bot_manager_role.id)))
                ) {
                    await interaction.reply({
                        content: "You do not have the necessary permissions to use this command",
                        ephemeral: true,
                    });
                    return;
                }
            }
            // Get position and next 4000 logs of the bot
            if (fs.existsSync(LOG_PATH)) {
                const logs = fs.readFileSync(LOG_PATH, "utf-8").split(/\r?\n/);
                const start_position = Math.max(0, (interaction.options.get("start")?.value as number | undefined) ?? logs.length - 4001);
                const end_position = Math.max(logs.length - 1, 0);
                const temp_log_path = Date.now().toString() + ".txt"; // Use timestamp

                const last_logs = logs.slice(start_position, end_position).join("\n");
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
}
