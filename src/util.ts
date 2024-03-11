/**
 * @description Simple utilities functions we use
 */
import { EmbedBuilder } from "discord.js";

/**
 * @description Formats any embedded to include the start formatting
 * @param embed
 * @param color
 */
export function format_embed(embed: EmbedBuilder, color: "yellow" | "red") {
    return embed.setColor(color === "yellow" ? "#FFC72A" : "#C20430").setFooter({
        text: "The UofG FSAE Bot will never ask your personal information, passwords, identification, and/or SSNs. Stay safe!",
    });
}
