import {CommandInteraction, EmbedBuilder, GuildMember, SlashCommandBuilder} from "discord.js";
const FORM_LINK: string = "https://forms.office.com/r/pTGwYxBTHq";

export default {
    data: new SlashCommandBuilder().setName("verify").setDescription("Verify yourself to become a member of Gryphon Racing!"),
    async execute(interaction: CommandInteraction) {
        if (interaction.user.bot) return;
        await interaction.reply({
            content: "Please check your DMs!",
            ephemeral: true,
        });
        const embeds = new EmbedBuilder()
            .setTitle("UofG Racing Verification")
            .setDescription("Welcome! To gain access to the server, please verify yourself.")
            .addFields(
                { name: "How", value: `1. Apply to this [form](<${FORM_LINK}>).\n2. **DM the bot** the email given to the form.\n3. Follow the instructions given.` },
                { name: "Accepted emails", value: "**Only @uoguelph.ca** are accepted emails." },
                { name: "Code expiration", value: "Your code will **expire in 5 minutes**. If it has, please resend your email address and we will send you a new code." },
            )
            .setColor("#FFC72A")
            .setFooter({ text: "UofG Racing will not ask for passwords, credit card information, SSNs, ID, and/or tokens" });
        await interaction.user.send({ embeds: [embeds] });
    },
};
