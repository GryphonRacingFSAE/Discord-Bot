# Discord-Bot

## About

A Discord bot used internally on our servers to monitor Audit logs and perform other small tasks

### Setup

- Install [NodeJS](https://cmake.org/download/) & ensure it is installed to PATH.
- Populate .env with the required variables:
```toml
DISCORD_BOT_TOKEN=...
DISCORD_APPLICATION_ID=...
DISCORD_GUILD_ID=...
```

## Building

```bash
npm run build
```

## Running

```bash
node dist/index.mjs
```

## Resources

* [discord.js docs](https://old.discordjs.dev/#/docs/discord.js/14.11.0/general/welcome)
* [discord.js guide](https://discordjs.guide/)