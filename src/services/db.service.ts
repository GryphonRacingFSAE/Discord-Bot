/**
 * @description A service dedicated to generic maintenance
 */
import * as Service from "@/service.js";
import { SlashCommandBuilder } from "discord.js";
import { DiscordClient } from "@/discord-client";
import { db } from "@/db.js";
import * as permissions from "@/services/permissions/index.js";
import { Command } from "@/service.js";

const force_update = {
    data: new SlashCommandBuilder()
        .setName("db")
        .setDescription("Commands regarding to do with the database")
        .addSubcommand(sub_command => sub_command.setName("refresh").setDescription("Forcefully rescans the entire server")) as SlashCommandBuilder,
    execution: async (client: DiscordClient, interaction) => {
        if (db === undefined) return interaction.reply({ ephemeral: true, content: "Database is down." }).then(_ => {});
        console.log("Refreshing!");
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
        await guild.members.fetch();
        return permissions
            .check_members(client, Array.from(guild.members.cache.filter(member => !member.user.bot).values()))
            .then(async _ => {
                await interaction.reply({
                    content: "Refreshed!",
                    ephemeral: true,
                });
            })
            .then(_ => {});
    },
    validate: (_: DiscordClient) => {
        return Promise.resolve(true);
    },
} satisfies Command;

const service = {
    name: "db",
    validate: async () => {
        return (
            process.env.MYSQL_HOST !== undefined &&
            process.env.MYSQL_USER !== undefined &&
            process.env.MYSQL_PASSWORD !== undefined &&
            process.env.MYSQL_DATABASE !== undefined &&
            process.env.MYSQL_PORT !== undefined &&
            process.env.DISCORD_GUILD_ID !== undefined
        );
    },
    commands: [force_update],
} satisfies Service.Service;

export default service;
