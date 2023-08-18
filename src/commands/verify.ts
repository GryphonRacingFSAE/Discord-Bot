import { CommandInteraction, EmbedBuilder, GuildMember, SlashCommandBuilder, User } from "discord.js";
import { sendVerificationMessage } from "@/vertification";

export default {
    data: new SlashCommandBuilder().setName("verify").setDescription("Verify yourself to become a member of Gryphon Racing!"),
    async execute(interaction: CommandInteraction) {
        if (interaction.user.bot) return;
        await sendVerificationMessage(interaction.member as GuildMember);
        await interaction.reply({
            content: "Please check your DMs!",
            ephemeral: true,
        });
    },
};
