import { Command, OnReady, Service } from "@/service.ts";
import { ChatInputCommandInteraction, CommandInteraction, Events, Guild, GuildMember, MessageFlags, SlashCommandBuilder, TextChannel } from "discord.js";
import cron from "node-cron";
import { member_has_permission_or } from "@/permissions.ts";
import { join } from "node:path";

async function saveAuditLogs(interaction: CommandInteraction | null, guild: Guild, start_date?: string) {
    // Calculate the filtered start date based on the provided start date or default to one week ago
    let filtered_start_date: Date;
    if (start_date) {
        filtered_start_date = new Date(start_date);
    } else {
        filtered_start_date = new Date();
        filtered_start_date.setDate(filtered_start_date.getDate() - 6);
    }
    console.log("Saving audit logs since:", filtered_start_date.toISOString().slice(0, 10));

    try {
        // Fetch the audit logs for the guild
        const audit_logs = await guild.fetchAuditLogs();
        const logs_in_range = audit_logs.entries.filter(entry => entry.createdAt > filtered_start_date);
        const logs_array = logs_in_range.reverse();

        // Create a directory to store the logs file
        const logs_dir = "./resources/logs";
        try {
            await Deno.mkdir(logs_dir, { recursive: true });
        } catch {}

        // Get the start and end date strings for the file name
        const formatted_start_date = filtered_start_date.toISOString().slice(0, 10);
        const formatted_end_date = new Date().toISOString().slice(0, 10);

        // Create the file name and path
        const file_name = `${formatted_start_date}_${formatted_end_date}.json`;
        const file_path = join(logs_dir, file_name);

        // Write the logs to the file
        await Deno.writeTextFile(file_path, JSON.stringify(logs_array, null, 2));

        // If the command is run manually (interaction provided), reply with the audit logs file
        if (interaction) {
            await interaction.reply({
                content: `Audit logs from ${formatted_start_date} to ${formatted_end_date}:`,
                files: [file_path],
            });
        }
        // If the command is run automatically (no interaction provided), post the audit logs file to the "audit-logs" channel
        else {
            const channel = guild.channels.cache.find(ch => ch.name === "audit-logs") as TextChannel | undefined;
            if (channel) {
                await channel.send({
                    content: `Audit logs from ${formatted_start_date} to ${formatted_end_date}:`,
                    files: [file_path],
                });
            }
        }
        console.log("Successfully saved audit logs.");
    } catch (error) {
        console.error("Error saving audit logs:", error);
        // If the command is run manually (interaction provided), reply with an error message
        if (interaction) {
            await interaction.reply("An error occurred while saving audit logs.");
        }
    }
}

const save_audit_logs = {
    data: new SlashCommandBuilder()
        .setName("save-audit-logs")
        .setDescription("Save audit logs from the past week.")
        .addStringOption(option => option.setName("start-date").setDescription("The start date in the format YYYY-MM-DD.").setRequired(false)) as SlashCommandBuilder,
    execution: async (client, interaction) => {
        if (!(interaction.member instanceof GuildMember)) return;
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply("This command can only be used in a server (guild).");
            return;
        }

        // Check perms
        if (!(await member_has_permission_or(interaction.member, ["Verified"]))) {
            return interaction
                .reply({
                    flags: MessageFlags.Ephemeral,
                    content: "Insufficient permissions",
                })
                .then(_ => {});
        }

        // Get the start date from the interaction options, if provided
        const start_date = (interaction as ChatInputCommandInteraction).options.getString("start-date");

        // Call the function to save the audit logs, with interaction provided to indicate the manual scenario
        await saveAuditLogs(interaction, guild, start_date);
    },
    validate: _ => Promise.resolve(true),
} satisfies Command;

const on_ready = {
    run_on: [Events.ClientReady],
    once: true,
    validate: _ => Promise.resolve(true),
    execution: async (_, client, __) => {
        cron.schedule(
            "59 23 * * 6",
            async () => {
                const guild_id = process.env.DISCORD_GUILD_ID;

                // Fetch the guild
                const guild = client.guilds.cache.get(guild_id!);
                if (!guild) {
                    console.error(`Cannot find guild with ID ${guild_id!}`);
                    return;
                }

                // Call the function and handle any errors
                try {
                    await saveAuditLogs(null, guild);
                    console.log("Audit logs saved successfully.");
                } catch (error) {
                    console.error("Error occurred while saving audit logs:", error);
                }
            },
            {
                timezone: "America/Toronto",
            },
        ).start();
    },
} satisfies OnReady;

const service = {
    name: "audit",
    validate: _ => Promise.resolve(process.env.DISCORD_GUILD_ID !== undefined),
    events: [on_ready],
    commands: [save_audit_logs],
} satisfies Service;

export default service;
