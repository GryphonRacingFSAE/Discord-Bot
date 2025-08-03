import { Command, OnReady, Service } from "@/service.ts";
import { Events, SlashCommandBuilder } from "discord.js";
import { DiscordClient } from "@/discord-client.ts";
import cron from "node-cron";
import * as permissions from "./index.ts";
import { db } from "@/db.ts";

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
        }).start();
        return;
    },
};

const service: Service = {
    name: "permissions",
    validate: async client => {
        return (
            process.env.DATABASE_PATH !== undefined &&
            process.env.DISCORD_GUILD_ID !== undefined
        );
    },
    events: [on_ready],
};

export default service;
