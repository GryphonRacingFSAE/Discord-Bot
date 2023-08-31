# GRacingBot (Discord-Bot)

## About

A Discord bot used internally on our server to provide the following services:

-   Monitor and backup audit logs (locally and on the server itself)
-   Schedule events and countdown for events in specific chats
-   Monitor our shop door(s) and update on whether the shop is open/closed (WIP)
-   Semi-automatic verification of members in the Discord server (WIP)

## Setup

-   Install [NodeJS](https://nodejs.org/en) & ensure it is installed to PATH.
-   Create a discord bot & discord server for private development
    -   [This](https://www.freecodecamp.org/news/create-a-discord-bot-with-javascript-nodejs/) is quite a good guide.
    -   Invite the bot to your server with these permissions:
        ![image](https://github.com/GryphonRacingFSAE/Discord-Bot/assets/36043275/20f4ef5f-900d-4ca2-ade2-e2d04a2d7fd6)
    -   This privileged intent is required for auto-role detecting:
        ![image](https://github.com/GryphonRacingFSAE/Discord-Bot/assets/36043275/5b052e07-70c9-44ab-b98d-9d0ee3149e7e)
-   Populate .env with the required variables:

```ini
DISCORD_BOT_TOKEN=... # Bot auth token
DISCORD_GUILD_ID=... # Guild ID of the server you're testing with
DISCORD_APPLICATION_ID=... # Application ID of your bot
```

### Build + Run

```bash
npm install # Install dependencies
npm run build # Transpile TypeScript to JavaScript
node dist/deploy-commands.js # Register any new slash commands (if applicable)
node dist/index.js # Run Discord bot
```

## Development

### Shop Status Monitoring - Evan

We have an ESP32 at the main shop entrance monitoring if it's open or closed, if the status changes, it sends a POST request to an HTTP server with the Discord bot, which then sends a message to the server.

### Semi-Automatic Verification (WIP) - Danny

Fetch latest team roster + payment status from OneDrive using rclone and verify email. If passing all requirements, the user is given the role "Verified".

#### Onedrive sync

Syncing to the onedrive team verification roster xlsx file is done through rclone + a cron task. Syncing is done every 5 minutes using a [crontab](https://en.wikipedia.org/wiki/Cron) which executes an [rclone sync](https://rclone.org/commands/rclone_sync/) command. To edit the synchronization file, please run `crontab -e` on the dev box/server to access the cron task configuration + synchronization command.

We currently sync between `~/Documents/onedrive-sync` and `/Gryphon Racing Administration/Team Roster` folder. 

### Countdown - Danny

Initiate a countdown from a Captain or Lead, update the countdown every 5 minutes, and push it to the latest in the chat every day. Save countdowns locally to preserve countdowns between launches.

### Log - Danny

Fetch the current running bots logs. It will fetch at most 4000 lines with an adjustable position to index deeper into the logs if needed.

### Restart - Danny

This command will shutdown. Utilizes the docker's auto-restart feature to reboot the bot.

### Audit Log Backup - Evan

Download the audit logs every week for the past week, and upload them to Discord to the audit-logs channel (hidden by default). Can also be uploaded manually via command by Captains and Leads.

### Subsection + Section Auto Assignment - Dallas

Assigns the Category role based on a users current role:

-   Dynamics: Frame, Aerodynamics, Brakes, Suspension
-   Electrical: Low Voltage, Embedded, Tractive System
-   Business: Marketing, Purchasing, Sponsorship

### Deployment - Dallas

This bot is run on the Embedded subsection's shop computer, it's run in a docker container and locally saved files are mounted onto the filesystem to ensure non-volatility.

## Resources

-   [discord.js docs](https://old.discordjs.dev/#/docs/discord.js/14.11.0/general/welcome)
-   [discord.js guide](https://discordjs.guide/)
-   [discord.js tutorial](https://www.freecodecamp.org/news/create-a-discord-bot-with-javascript-nodejs/)
