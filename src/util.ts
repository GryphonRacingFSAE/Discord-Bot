/**
 * @description Simple utilities functions we use
 */
import { EmbedBuilder, EmbedField } from "discord.js";

/**
 * @description Formats any embedded to include the start formatting
 * @param embed
 * @param color
 */
export function format_embed(embed: EmbedBuilder, color: "yellow" | "red") {
    return embed.setColor(color === "yellow" ? "#FFC72A" : "#C20430").setFooter({
        text: "The UoG FSAE Bot will never ask your personal information, passwords, identification, and/or SSNs. Stay safe!",
    });
}

export function quick_embed(title: string, description: string, color: "yellow" | "red", field?: EmbedField[]) {
    return format_embed(
        new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setFields(field || []),
        color,
    );
}
