from datetime import datetime, time
import asyncio
import json
import os
from zoneinfo import ZoneInfo

import discord
import paho.mqtt.client as mqtt
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv("DISCORD_BOT_TOKEN")
CHANNEL_ID = os.getenv("DISCORD_CHANNEL_ID")

if not TOKEN:
    raise RuntimeError("DISCORD_BOT_TOKEN is not set")

MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "mosquitto")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", 1883))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "shop-status")

COMPS_FILE = "comps.json"

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
last_known_status = None
mqtt_client = None


@tree.command(name="comp", description="List upcoming competitions")
async def comp(interaction: discord.Interaction):
    comps = load_comps()
    if not comps:
        await interaction.response.send_message("No competitions added yet")
        return

    now = datetime.now(ZoneInfo("America/New_York"))
    embed = discord.Embed(
        title="Upcoming Competitions 🗓️",
        color=discord.Color.blue(),
    )

    for comp in comps:
        comp_time = datetime.strptime(comp["date"], "%Y-%m-%dT%H:%M:%S")
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
        datetime.fromisoformat(date)
    except ValueError:
        await interaction.response.send_message(
            "Invalid date format. Use ISO 8601, e.g., `2025-08-01T18:00:00`", ephemeral=True
        )
        return

    comps = load_comps()
    comps.append({"name": name, "date": date})
    save_comps(comps)

    await interaction.response.send_message(f"Competition **{name}** added for {date}")


def build_status_embed(status: str, rssi: int | None) -> discord.Embed:
    color = {"OPEN": discord.Color.green(), "CLOSED": discord.Color.red(),}.get(status, discord.Color.greyple())
    embed = discord.Embed(
        title=f"Shop Status: {status}",
        color=color,
        timestamp=datetime.now(ZoneInfo("America/New_York")),
    )
    if rssi is not None:
        embed.set_footer(text=f"RSSI: {rssi} dBm")
    return embed


async def announce_status_change(status: str, rssi: int | None):
    if not CHANNEL_ID:
        print("[mqtt] CHANNEL_ID not set")
        return
    
    channel = bot.get_channel(int(CHANNEL_ID))
    if channel is None:
        print(f"[mqtt] failed to get channel with ID {CHANNEL_ID}")
        return

    await channel.send(embed=build_status_embed(status, rssi))


def on_mqtt_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        client.subscribe(MQTT_TOPIC)
        print(f"[mqtt] connected to {MQTT_BROKER_HOST}:{MQTT_BROKER_PORT}. subscribed to topic '{MQTT_TOPIC}'")
    else:
        print(f"[mqtt] failed to connect, return code {rc}")


def on_mqtt_message(client, userdata, msg):
    global last_known_status

    payload = msg.payload.decode(errors="replace")
    try: 
        data = json.loads(payload)
        status = data.get("shop-status")
        rssi = data.get("rssi")
    except (json.JSONDecodeError, AttributeError):
        status = payload
        rssi = None

    if status is None:
        return
    
    if last_known_status is None:
        last_known_status = status
        print(f"[mqtt] initial door state: {status}")
        return
    
    if status != last_known_status:
        last_known_status = status
        print(f"[mqtt] doot state changed: {status}")
        asyncio.run_coroutine_threadsafe(announce_status_change(status, rssi), bot.loop)


def start_mqtt_client():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="discord-bot-subscriber")
    client.on_connect = on_mqtt_connect
    client.on_message = on_mqtt_message
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    client.connect(MQTT_BROKER_HOST, MQTT_BROKER_PORT, keepalive=60)
    client.loop_start()
    return client


@bot.event
async def on_ready():
    global mqtt_client

    print(f"Logged in as {bot.user}")
    try:
        synced = await tree.sync()
        print(f"Synced {len(synced)} commands")
    except Exception as e:
        print(f"Error syncing commands: {e}")

    if mqtt_client is None:
        mqtt_client = start_mqtt_client()


bot.run(TOKEN)
