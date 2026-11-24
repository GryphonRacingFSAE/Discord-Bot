from datetime import datetime, time
import asyncio
import json
import os
from typing import NamedTuple
from zoneinfo import ZoneInfo

import discord
import paho.mqtt.client as mqtt
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv

from status_announcer import StatusAnnouncer

load_dotenv()
TOKEN = os.getenv("DISCORD_BOT_TOKEN")

if not TOKEN:
    raise RuntimeError("DISCORD_BOT_TOKEN is not set")

COMPS_FILE = "comps.json"


class ShopConfig(NamedTuple):
    host: str
    port: int
    topic: str
    channel_id: int


def load_shop_config() -> ShopConfig | None:
    """Read the shop status settings from the environment.

    Returns None (and logs why) if the feature can't run, so /comp and /comp_add
    keep working on deployments that only have a bot token.
    """
    host = (os.getenv("MQTT_BROKER_HOST") or "").strip()
    topic = (os.getenv("MQTT_TOPIC") or "").strip() or "shop-status"
    port_raw = (os.getenv("MQTT_BROKER_PORT") or "").strip() or "1883"
    channel_raw = (os.getenv("DISCORD_CHANNEL_ID") or "").strip()

    problems = []

    if not host:
        problems.append("MQTT_BROKER_HOST is not set")

    port = 0
    try:
        port = int(port_raw)
    except ValueError:
        problems.append(f"MQTT_BROKER_PORT must be an integer, got {port_raw!r}")
    else:
        if not 1 <= port <= 65535:
            problems.append(f"MQTT_BROKER_PORT must be between 1 and 65535, got {port}")

    channel_id = 0
    if not channel_raw:
        problems.append("DISCORD_CHANNEL_ID is not set")
    else:
        try:
            channel_id = int(channel_raw)
        except ValueError:
            problems.append(f"DISCORD_CHANNEL_ID must be a number, got {channel_raw!r}")

    if problems:
        print("[shop] shop status feature disabled: " + "; ".join(problems))
        return None

    return ShopConfig(host, port, topic, channel_id)


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

# shop status state (set up in start_shop_feature)
shop_started = False
shop_config: ShopConfig | None = None
announcer: StatusAnnouncer | None = None
mqtt_client = None
main_loop = None


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
    status_key = str(status).strip().upper()

    if status_key == "OPEN":
        title = "🟢 The shop is open!"
        color = discord.Color.green()
    elif status_key == "CLOSED":
        title = "🔴 The shop is closed"
        color = discord.Color.red()
    else:
        title = f"Shop status: {status}"
        color = discord.Color.greyple()

    embed = discord.Embed(
        title=title,
        color=color,
        timestamp=datetime.now(ZoneInfo("America/New_York")),
    )
    if rssi is not None:
        embed.set_footer(text=f"RSSI: {rssi} dBm")
    return embed


def on_mqtt_connect(client, userdata, flags, reason_code, properties=None):
    if not reason_code.is_failure:
        # subscribing here also resubscribes after every reconnect
        client.subscribe(shop_config.topic)
        print(f"[mqtt] connected to {shop_config.host}:{shop_config.port}. subscribed to topic '{shop_config.topic}'")
    else:
        print(f"[mqtt] failed to connect: {reason_code}")


def on_mqtt_disconnect(client, userdata, disconnect_flags, reason_code, properties=None):
    print(f"[mqtt] disconnected ({reason_code}); paho will retry automatically")


def on_mqtt_message(client, userdata, msg):
    # Runs in paho's thread: parse here, then hand off to the Discord event loop.
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

    status = str(status).strip().upper()

    try:
        main_loop.call_soon_threadsafe(announcer.update, status, rssi)
    except RuntimeError as e:
        print(f"[mqtt] could not hand message to the bot: {e}")


def start_mqtt_client(config: ShopConfig):
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="discord-bot-subscriber")
    client.on_connect = on_mqtt_connect
    client.on_disconnect = on_mqtt_disconnect
    client.on_message = on_mqtt_message
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    # connect_async doesn't block; loop_start runs the network loop in its own thread
    client.connect_async(config.host, config.port, keepalive=60)
    client.loop_start()
    return client


async def start_shop_feature():
    """Validate the shop settings and start the MQTT client + announcer (once)."""
    global shop_started, shop_config, announcer, mqtt_client, main_loop

    # on_ready can fire more than once, so only set this up once
    if shop_started:
        return
    shop_started = True

    config = load_shop_config()
    if config is None:
        return

    shop_config = config
    main_loop = asyncio.get_running_loop()

    async def send_status(status: str, rssi: int | None):
        channel = bot.get_channel(config.channel_id) or await bot.fetch_channel(config.channel_id)
        await channel.send(embed=build_status_embed(status, rssi))
        print(f"[discord] sent status message: {status}")

    announcer = StatusAnnouncer(send_status)
    announcer.start()
    mqtt_client = start_mqtt_client(config)


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user}")
    try:
        synced = await tree.sync()
        print(f"Synced {len(synced)} commands")
    except Exception as e:
        print(f"Error syncing commands: {e}")

    await start_shop_feature()


bot.run(TOKEN)