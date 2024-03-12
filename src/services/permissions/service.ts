import { Command, OnReady, Service } from "@/service.js";
import { Events, SlashCommandBuilder } from "discord.js";
import { DiscordClient } from "@/discord-client.js";
import cron from "node-cron";
import * as permissions from "./index.js";
import { db } from "@/db.js";

const on_ready: OnReady = {
    run_on: [Events.ClientReady],
    once: true,
    validate: async () => {
        return true;
    },
    execution: async (_, client, __) => {
        if (db === undefined) return;
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
        // wait for the reckoning
        await guild.members.fetch();
        await permissions.check_members(client, Array.from(guild.members.cache.filter(member => !member.user.bot).values()));
        // run once a day (i hope)
        cron.schedule("0 0 * * *", async () => {
            guild.members.fetch().then(_ => permissions.check_members(client, Array.from(guild.members.cache.filter(member => !member.user.bot).values())));
        });
        return;
    },
};

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
};

export default service;
