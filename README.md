# GRacingBot (Discord-Bot)

## About

A Discord bot used internally on our server to provide the following services:
- Monitor and backup Audit logs (locally and on the server itself)
- Schedule events and countdown for events in specific chats
- Monitor our shop and send/update on whether the shop is open/closed (WIP)
- Semi-automatic verification of members in discord (WIP)

## Setup

- Install [NodeJS](https://nodejs.org/en) & ensure it is installed to PATH.
- Create a discord bot & discord server for private development
  - [This](https://www.freecodecamp.org/news/create-a-discord-bot-with-javascript-nodejs/) is quite a good guide.
  - Invite the bot to your server with these permissions:
    ![image](https://github.com/GryphonRacingFSAE/Discord-Bot/assets/36043275/20f4ef5f-900d-4ca2-ade2-e2d04a2d7fd6)
- Populate .env with the required variables:

```ini
DISCORD_BOT_TOKEN=... # Bot auth token
DISCORD_GUILD_ID=... # Guild ID of the server you're testing with
DISCORD_APPLICATION_ID=... # Application ID of your bot
```

### Build + Run

```bash
npm install # Install dependencies
npm run build # Transpile TypeScript to JavaScript
node dist/deploy-commands.js # Register any new `/` commands (if applicable):
node dist/index.mjs # Run Discord bot:
```

## Development

### Shop Status Monitoring (WIP) - Evan

We have an ESP32 at the main shop entrance monitoring if it's open or closed, if the status changes, it sends a POST request to a http server with the discord bot, which then sends a message to the Discord

### Semi-Automatic Verification (WIP) - Danny

Fetch latest team roster + payment status from onedrive (TBD how), verify email, verify student number, verify student ID? If passing all requirements, the user is given the role "verified".

### Countdown - Danny

Initiate a countdown from a captain or lead, update the countdown every 5 minutes, and push it to the latest in the chat every day. Save countdowns locally to preserve countdowns between launches

### Audit Log Backup - Evan

Download the audit logs every week for the past week, and upload them to Discord to the audit-logs channel (hidden by default). Can also be uploaded manually via command by Captains and Leads.

### Deployment - Dallas

This bot is run on the Embedded subsection's shop computer, it's run in a docker container and locally saved files are mounted onto the filesystem to ensure non-volatility.

## Resources

* [discord.js docs](https://old.discordjs.dev/#/docs/discord.js/14.11.0/general/welcome)
* [discord.js guide](https://discordjs.guide/)
* [discord.js tutorial](https://www.freecodecamp.org/news/create-a-discord-bot-with-javascript-nodejs/)
