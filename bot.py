from datetime import datetime, time
import asyncio
import json
import os
import threading
from zoneinfo import ZoneInfo

import discord
import paho.mqtt.client as mqtt
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv("DISCORD_BOT_TOKEN")

if not TOKEN:
    raise RuntimeError("DISCORD_BOT_TOKEN is not set")


def load_mqtt_config():
    """Read and validate MQTT settings from the environment."""
    host = (os.getenv("MQTT_BROKER_HOST") or "").strip() or "mosquitto"
    topic = (os.getenv("MQTT_TOPIC") or "").strip() or "shop-status"
    port_raw = (os.getenv("MQTT_BROKER_PORT") or "").strip() or "1883"

    try:
        port = int(port_raw)
    except ValueError:
        raise RuntimeError(f"MQTT_BROKER_PORT must be an integer, got {port_raw!r}")
    if not 1 <= port <= 65535:
        raise RuntimeError(f"MQTT_BROKER_PORT must be between 1 and 65535, got {port}")

    return host, port, topic


def load_channel_id():
    raw = (os.getenv("DISCORD_CHANNEL_ID") or "").strip()
    if not raw:
        raise RuntimeError("DISCORD_CHANNEL_ID is not set")
    try:
        return int(raw)
    except ValueError:
        raise RuntimeError(f"DISCORD_CHANNEL_ID must be a number, got {raw!r}")


MQTT_BROKER_HOST, MQTT_BROKER_PORT, MQTT_TOPIC = load_mqtt_config()
DISCORD_CHANNEL_ID = load_channel_id()

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

# shop status state
state_lock = threading.Lock()
last_known_status = None   # last status handled (initial, or confirmed sent to Discord)
pending_status = None      # status currently being sent, to avoid duplicate sends
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


async def announce_status_change(status: str, rssi: int | None):
    global last_known_status, pending_status

    sent = False
    try:
        channel = bot.get_channel(DISCORD_CHANNEL_ID)
        if channel is None:
            print(f"[discord] failed to get channel with ID {DISCORD_CHANNEL_ID}")
            return

        await channel.send(embed=build_status_embed(status, rssi))
        sent = True
        print(f"[discord] sent status message: {status}")
    except Exception as e:
        print(f"[discord] failed to send message: {type(e).__name__}: {e}")
    finally:
        with state_lock:
            if sent:
                # only now is the new state considered announced
                last_known_status = status
            pending_status = None


def on_mqtt_connect(client, userdata, flags, reason_code, properties=None):
    if not reason_code.is_failure:
        # subscribing here means we also resubscribe after every reconnect
        client.subscribe(MQTT_TOPIC)
        print(f"[mqtt] connected to {MQTT_BROKER_HOST}:{MQTT_BROKER_PORT}. subscribed to topic '{MQTT_TOPIC}'")
    else:
        print(f"[mqtt] failed to connect: {reason_code}")


def on_mqtt_disconnect(client, userdata, disconnect_flags, reason_code, properties=None):
    print(f"[mqtt] disconnected ({reason_code}); paho will retry automatically")


def on_mqtt_message(client, userdata, msg):
    global last_known_status, pending_status

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

    with state_lock:
        if last_known_status is None:
            last_known_status = status
            print(f"[mqtt] initial shop state: {status}")
            return

        # already announced, or a send for this state is already in flight
        if status == last_known_status or status == pending_status:
            return

        pending_status = status

    print(f"[mqtt] shop state changed: {status}")
    try:
        asyncio.run_coroutine_threadsafe(announce_status_change(status, rssi), main_loop)
    except Exception as e:
        print(f"[mqtt] failed to schedule announcement: {type(e).__name__}: {e}")
        with state_lock:
            pending_status = None


def start_mqtt_client():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="discord-bot-subscriber")
    client.on_connect = on_mqtt_connect
    client.on_disconnect = on_mqtt_disconnect
    client.on_message = on_mqtt_message
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    # connect_async doesn't block; loop_start runs the network loop in its own thread
    client.connect_async(MQTT_BROKER_HOST, MQTT_BROKER_PORT, keepalive=60)
    client.loop_start()
    return client


@bot.event
async def on_ready():
    global mqtt_client, main_loop

    print(f"Logged in as {bot.user}")
    try:
        synced = await tree.sync()
        print(f"Synced {len(synced)} commands")
    except Exception as e:
        print(f"Error syncing commands: {e}")

    # on_ready can fire more than once, so only start one MQTT client
    if mqtt_client is None:
        main_loop = asyncio.get_running_loop()
        mqtt_client = start_mqtt_client()


bot.run(TOKEN)