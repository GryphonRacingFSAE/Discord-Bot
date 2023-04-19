import { Client, Events, GatewayIntentBits } from "discord.js";
import fs from "node:fs";
import process from "node:process"

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, async c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
    const fetchedLogs = await guild.fetchAuditLogs();
    console.log(fetchedLogs.entries);
    fs.writeFileSync("logs.json", JSON.stringify(fetchedLogs.entries))
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_BOT_TOKEN);
