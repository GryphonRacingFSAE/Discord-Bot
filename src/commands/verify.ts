import { CommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
    data: new SlashCommandBuilder().setName("verify").setDescription("You should verify yourself NOW!"),
    async execute(interaction: CommandInteraction) {
        await interaction.reply({
            content: "Fill out this [form](https://youtu.be/fC7oUOUEEi4) first. Once you did, please DM the bot with your email address given for the form to verify your discord account.",
            ephemeral: true,
        });
    },
};
