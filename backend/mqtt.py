import os
import json
import time

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

load_dotenv()

MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "mosquitto")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", 1883))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "shop-status")

INFLUXDB_URL = os.getenv("INFLUXDB_URL", "http://localhost:8086")
INFLUXDB_TOKEN = os.getenv("INFLUXDB_TOKEN")
INFLUXDB_ORG = os.getenv("INFLUXDB_ORG")
INFLUXDB_BUCKET = os.getenv("INFLUXDB_BUCKET", "shop_status")

if not INFLUXDB_TOKEN or not INFLUXDB_ORG:
    raise RuntimeError("INFLUXDB_TOKEN and INFLUXDB_ORG must be set")

influx_client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
write_api = influx_client.write_api(write_options=SYNCHRONOUS)


def log_to_influx(status: str, rssi: int | None):
    point = Point("shop-status").tag("status", status)

    if rssi is not None:
        point = point.field("rssi", rssi)

    if status in ("OPEN", "CLOSED"):
        point = point.field("closed", 1 if status == "CLOSED" else 0)
    elif status == "OFFLINE":
        point = point.field("offline", 1)
    
    try:
        write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
        suffix = f" RSSI = {rssi}" if rssi is not None else ""
        print(f"[influx] logged '{status}'{suffix}")
    except Exception as e:
        print(f"[influx] failed to log '{status}': {e}")


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        client.subscribe(MQTT_TOPIC)
        print(f"[mqtt] connected to {MQTT_BROKER_HOST}:{MQTT_BROKER_PORT}. subscribed to topic '{MQTT_TOPIC}'")
    else:
        print(f"[mqtt] failed to connect, return code {rc}")


def on_disconnect(client, userdata, flags, rc, properties=None):
    print(f"[mqtt] disconnected from broker with return code {rc}")


def on_message(client, userdata, msg,):
    payload = msg.payload.decode(errors="replace")

    try:
        data = json.loads(payload)
        status = data.get("shop-status")
        rssi = data.get("rssi")
    except (json.JSONDecodeError, AttributeError) as e:
        status = payload
        rssi = None
        print(f"[mqtt] failed to parse JSON payload '{payload}': {e}")


    if status not in ("OPEN", "CLOSED", "OFFLINE"):
        print(f"[mqtt] received invalid status '{status}'")
        return

    log_to_influx(status, rssi)


def main():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="influxdb-logger")
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=30)

    while True:
        try:
            client.connect(MQTT_BROKER_HOST, MQTT_BROKER_PORT, keepalive=60)
            break
        except (ConnectionRefusedError, OSError) as e:
            print(f"[mqtt] connection error: {e}")
            time.sleep(5)
    
    client.loop_forever()


if __name__ == "__main__":
    main()
