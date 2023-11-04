// If you see this message after 1 year this file has been originally committed, all hope is lost.
// This file should not exist. This file should never exist. Yet it does.
// This file is an example of bad planning. This file is an example of using spreadsheet as your database.
// This file is what not to do as this file is what happens when you don't.

import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import type { Command } from "@/types.js";
import { pullSpreadsheet, pushSpreadsheet, SpreadsheetSingleton } from "@/vertification.js";

let verification_spreadsheet = SpreadsheetSingleton.getInstance();

export default {
    /*
     * Define information about the bot required by discord.js
     */
    data: new SlashCommandBuilder().setName("verification")
        .addSubcommand(sub_command =>
            sub_command
                .setName("edit")
                .addStringOption(option =>
                    option
                        .setName("target")
                        .setDescription("Full name to target. If no name exists, a new will be made and you will be notified of it.")
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName("email")
                        .setDescription("Email address of user")
                        .setRequired(false))
                .addBooleanOption(option =>
                    option
                        .setName("gryphlife")
                        .setDescription("Whether or not user is in GryphLife")
                        .setRequired(false))
                .addBooleanOption(option =>
                    option
                        .setName("paid")
                        .setDescription("Whether or not user has paid")
                        .setRequired(false))
                .addStringOption(option =>
                    option
                        .setName("discord_id")
                        .setDescription("Discord ID of user. THIS SHOULD NOT AT ALL BE USED UNLESS YOU KNOW WHAT YOU ARE DOING.")
                        .setRequired(false))
        )
        .addSubcommand(sub_command =>
            sub_command
                .setName("remove")
                .setDescription("Remove a user from the spreadsheet which will wipe out their row")
                .addStringOption(option =>
                    option
                        .setName("target")
                        .setDescription("Full name to target.")
                        .setRequired(true))),

    async execute(interaction: CommandInteraction) {
        if (!interaction.isChatInputCommand()) return;
        {
            // Determine permission to use
            const guild = interaction.guild;
            if (!guild) {
                await interaction.reply({ content: "This command can only be used in a server (guild)", ephemeral: true });
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
                await interaction.reply({ content: "You do not have the necessary permissions to use this command", ephemeral: true });
                return;
            }
        }
        const options = interaction.options;
        switch (options.getSubcommand()) {
            case "edit": {
                const TARGET: string = options.get("target")?.value as string; // Only required
                const EMAIL: string | undefined = options.get("email")?.value as string | undefined;
                const GRYPHLIFE: boolean | undefined = options.get("gryphlife")?.value as boolean | undefined;
                const PAID: boolean | undefined = options.get("paid")?.value as boolean | undefined;
                const DISCORD_ID: string | undefined = options.get("discord_id")?.value as string | undefined; // Discord IDs should only be integers, BUT if we get a non-number, clear out the discord id
                // Get the latest data first
                await pullSpreadsheet().then(() => verification_spreadsheet.mutex.runExclusive( async () => {
                    let USER_ROW_INDEX = verification_spreadsheet._data.findIndex( data => data.name.toLowerCase() === TARGET.toLowerCase());
                    let data; // Verification data but is temporary for now
                    if (USER_ROW_INDEX == -1) {
                        // Does not exist! Create a new one!
                        data = {
                                name: TARGET,
                                email: "",
                                in_gryphlife: "",
                                payment_status: "",
                                discord_identifier: "",
                        }
                        verification_spreadsheet._data.push(data);
                        USER_ROW_INDEX = verification_spreadsheet._data.length - 1;
                        await interaction.reply({content: `Could not find: ${TARGET}, making a new one.`, ephemeral: true});
                    } else {
                        data = verification_spreadsheet._data[USER_ROW_INDEX];
                    }

                    // Override all data, if it has been filled in. If not, ignore it.
                    data = {
                        name: data.name,
                        email: EMAIL ? EMAIL : data.email,
                        in_gryphlife: GRYPHLIFE ? "yes" : data.in_gryphlife,
                        payment_status: PAID ? "paid" : data.payment_status,
                        discord_identifier: DISCORD_ID ? DISCORD_ID : data.discord_identifier
                    };
                    verification_spreadsheet._data[USER_ROW_INDEX] = data;
                    await interaction.reply({content: `Edited \`${TARGET}\`'s data`, ephemeral: true});
                })).then(() => pushSpreadsheet());

                break;
            }
            case "remove": {
                const TARGET: string = options.get("target")?.value as string; // Only required

                await pullSpreadsheet().then(() => verification_spreadsheet.mutex.runExclusive(  async () => {
                    let USER_ROW_INDEX = verification_spreadsheet._data.findIndex( data => data.name.toLowerCase() === TARGET.toLowerCase());
                    if (USER_ROW_INDEX == -1) {
                        // Does not exist! Cannot remove at all.
                        await interaction.reply({content: `Could not find: ${TARGET}.`, ephemeral: true});
                    } else {
                        verification_spreadsheet._data.splice(USER_ROW_INDEX, 1);
                        await interaction.reply({content: `Removed \`${TARGET}\` 's data`, ephemeral: true});
                    }
                })).then(() => pushSpreadsheet());
            }
        }
    },
} as Command;
