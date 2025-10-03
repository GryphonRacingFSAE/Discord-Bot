from datetime import datetime, time
import json
import os
from zoneinfo import ZoneInfo

import discord
from discord import app_commands
from discord.ext import commands, tasks
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv("DISCORD_BOT_TOKEN")

COMPS_FILE = "comps.json"
SHOP_STATUS_FILE = "shop_status.json"   # Shop status
SHOP_STATUS_CHANNEL_ID = 1418329450080108586    # Shop status channel ID


# load competitions from file
def load_comps():
    try:
        with open(COMPS_FILE, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return []


# save competitions to file
def save_comps(comps):
    with open(COMPS_FILE, "w") as f:
        json.dump(comps, f, indent=2)


# bot setup
intents = discord.Intents.default()
bot = commands.Bot(command_prefix="!", intents=intents)
tree = bot.tree
# Shop status variables
bot.status_msg = None
bot.last_status_msg = None


@tree.command(name="comp", description="List upcoming competitions")
async def comp(interaction: discord.Interaction):
    comps = load_comps()
    if not comps:
        await interaction.response.send_message("No competitions added yet")
        return

    now = datetime.datetime.now(ZoneInfo("America/New_York"))
    embed = discord.Embed(
        title="Upcoming Competitions 🗓️",
        color=discord.Color.blue(),
    )

    for comp in comps:
        comp_time = datetime.datetime.strptime(comp["date"], "%Y-%m-%dT%H:%M:%S")
        comp_time = comp_time.replace(tzinfo=ZoneInfo("America/New_York"))
        remaining = comp_time - now
        if remaining.total_seconds() > 0:
            embed.add_field(
                name=comp["name"],
                value=f"**{str(remaining).split('.')[0]}** remaining\n `{comp['date']}`",
                inline=False,
            )
        else:
            embed.add_field(
                name=comp["name"],
                value=f"Already passed\n `{comp['date']}`",
                inline=False,
            )

    await interaction.response.send_message(embed=embed)


@tree.command(name="comp_add", description="Add a new competition")
@app_commands.describe(name="Name of the competition", date="ISO date (e.g. 2025-08-01T18:00:00)")
async def comp_add(interaction: discord.Interaction, name: str, date: str):
    try:
        datetime.datetime.fromisoformat(date)
    except ValueError:
        await interaction.response.send_message(
            "Invalid date format. Use ISO 8601, e.g., `2025-08-01T18:00:00`", ephemeral=True
        )
        return

    comps = load_comps()
    comps.append({"name": name, "date": date})
    save_comps(comps)

    await interaction.response.send_message(f"Competition **{name}** added for {date}")


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user}")
    try:
        synced = await tree.sync()
        print(f"Synced {len(synced)} commands")

        channel = await bot.fetch_channel(SHOP_STATUS_CHANNEL_ID)
        print(f"Fetched channel: {channel}")

        await init_shop_status()
        check_updates.start()
    except Exception as e:
        print(f"Error syncing commands: {e}")


# Load shop status from JSON
async def load_shop_status():
    status = ""
    try:
        with open(SHOP_STATUS_FILE, "r") as f:
            data = json.load(f)
            return data.get("shop-status", "UNKNOWN")
    except FileNotFoundError:
        return [] 
            

async def current_shop_status():
    now = datetime.now(ZoneInfo("America/New_York")).time()
    close = time(23, 0)
    open = time(8, 30)

    # I used this to test from 1:00 PM to 1:05 PM since I don't want to wait until 11:00 PM
    if close < open:
        if close <= now < open:
            return "CLOSED"
    else:
        # The one that does the actual thing
        if now >= close or now < open:
            return "CLOSED"

    status = await load_shop_status()
    return status
    


# Embed message for shop status (make it look nice)
async def shop_status_embed(status: str):
    if status == "OPEN":
        color = discord.Color.green()
    else:
        color = discord.Color.red()
    
    embed = discord.Embed(
        title="Shop Status 🏎",
        description=status,
        color=color
    )

    return embed

# Init shop status message
async def init_shop_status():
    channel = await bot.fetch_channel(SHOP_STATUS_CHANNEL_ID)

    status = await current_shop_status()
    embed = await shop_status_embed(status)
    bot.last_status_msg = status
    bot.status_msg = await channel.send(embed=embed)


# Update shop status message if changed
async def update_shop_status():
    channel = await bot.fetch_channel(SHOP_STATUS_CHANNEL_ID)

    if bot.status_msg:
        status = await current_shop_status()
        if status != bot.last_status_msg:
            await bot.status_msg.delete()
            embed= await shop_status_embed(status)
            bot.status_msg = await channel.send(embed=embed)
            bot.last_status_msg = status


@tasks.loop(seconds=5)  # check every 5 seconds
async def check_updates():
    await update_shop_status()


bot.run(TOKEN)
