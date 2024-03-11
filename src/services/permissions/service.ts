import { Command, OnReady, Service } from "@/service.js";
import { Events, SlashCommandBuilder } from "discord.js";
import { DiscordClient } from "@/discord-client.js";
import cron from "node-cron";
import * as permissions from "./index.js";
import * as gdb from "@/db.js";

const on_ready: OnReady = {
    run_on: [Events.ClientReady],
    once: true,
    validate: async () => {
        return true;
    },
    execution: async (_, client, db) => {
        if (db === undefined) return;
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
        // wait for the reckoning
        await guild.members.fetch();
        await permissions.check_members(client, Array.from(guild.members.cache.filter(member => !member.user.bot).values()), db);
        // run once a day (i hope)
        cron.schedule("0 0 * * *", async () => {
            guild.members.fetch().then(_ => permissions.check_members(client, Array.from(guild.members.cache.filter(member => !member.user.bot).values()), db));
        });
        return;
    },
};

const force_update = {
    data: new SlashCommandBuilder()
        .setName("db")
        .setDescription("Commands regarding to do with the database")
        .addSubcommand(sub_command => sub_command.setName("refresh").setDescription("Forcefully rescans the entire server")) as SlashCommandBuilder,
    execution: async (client: DiscordClient, interaction) => {
        if (gdb.db === undefined) return interaction.reply({ ephemeral: true, content: "Database is down." }).then(_ => {});
        console.log("Refreshing!");
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
        await guild.members.fetch();
        return permissions
            .check_members(client, Array.from(guild.members.cache.filter(member => !member.user.bot).values()), gdb.db!)
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

const service: Service = {
    name: "permissions",
    validate: async client => {
        return (
            process.env.MYSQL_HOST !== undefined &&
            process.env.MYSQL_USER !== undefined &&
            process.env.MYSQL_PASSWORD !== undefined &&
            process.env.MYSQL_DATABASE !== undefined &&
            process.env.MYSQL_PORT !== undefined &&
            process.env.DISCORD_GUILD_ID !== undefined
        );
    },
    events: [on_ready],
    commands: [force_update],
};

export default service;
