import { CommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";

export default {
    data: new SlashCommandBuilder().setName("verify").setDescription("You should verify yourself NOW!"),
    async execute(interaction: CommandInteraction) {
        const embeds = new EmbedBuilder()
            .setTitle("UofG Racing Verification")
            .setDescription("Welcome! To **gain access to the server, please verify yourself.**")
            .addFields(
                { name: "How", value: "1. Apply to this [form](<https://youtu.be/fC7oUOUEEi4>).\n2. **DM the bot** the email given to the form.\n3. Follow the instructions given." },
                { name: "Accepted emails", value: "**Only @uoguelph.ca** are accepted emails." },
            )
            .setColor("#FFC72A")
            .setFooter({ text: "UofG racing will not ask for passwords, credit card information, SSNs, ID, and/or tokens" });
        await interaction.user.send({
            embeds: [embeds],
        });
        await interaction.reply({
            content: "Please check your DMs!",
            ephemeral: true,
        });
    },
};
