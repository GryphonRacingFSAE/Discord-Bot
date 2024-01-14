import { CommandInteraction, GuildMember, SlashCommandBuilder } from "discord.js";
import { sendVerificationMessage } from "@/vertification.js";
import { Command } from "@/types";

export default function commandFactory() {
    if (!process.env.VERIFICATION_CHANNEL || !process.env.EMAIL_USERNAME || !process.env.EMAIL_PASSWORD || !(process.env.EMAIL_HOST || process.env.EMAIL_SERVICE) || !process.env.EMAIL_PORT) {
        console.warn("/verify command have been disabled");
        return null;
    } else {
        return {
            data: new SlashCommandBuilder().setName("verify").setDescription("Verify yourself to become a member of Gryphon Racing!"),
            async execute(interaction: CommandInteraction) {
                if (interaction.user.bot) return;
                await interaction.reply({
                    content: "Please check your DMs!",
                    ephemeral: true,
                });
                await sendVerificationMessage(interaction.member as GuildMember);
            },
        } as Command;
    }
}
