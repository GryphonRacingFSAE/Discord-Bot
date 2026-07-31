#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <esp_wpa2.h>
#include <PubSubClient.h>

#include "config.h"

#define DOOR_SWITCH_PIN 9
#define HEARTBEAT_INTERVAL 3000
#define MQTT_CLIENT_ID "grc-shop-status"
#define MQTT_TOPIC "shop-status"

// LWT: broker publishes this automatically if we disconnect uncleanly
// (network drop, brownout, crash) so subscribers never see stale "OPEN"/"CLOSED"
#define MQTT_LWT_MESSAGE "OFFLINE"
#define MQTT_LWT_QOS 1
#define MQTT_LWT_RETAIN true
 
WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastPublish = 0;
unsigned long lastMqttReconnectAttempt = 0;
unsigned long lastWifiReconnectAttempt = 0;

/** String currentDoorState()
 * @brief Returns the current state of the door switch as a string
 * @return String representing the current state of the door switch (OPEN or CLOSED)
 */
String currentDoorState() {
  return digitalRead(DOOR_SWITCH_PIN) == HIGH ? "CLOSED" : "OPEN";
}

/** void publishDoorState()
 * @brief Pack current state as JSON, serializes, and publishes the current state of the door switch to the MQTT broker
 */
void publishDoorState() {
  String shop_status = currentDoorState();
 
  JsonDocument doc;
  doc["shop-status"] = shop_status;
  doc["rssi"] = WiFi.RSSI();
 
  String payload;
  serializeJson(doc, payload);
 
  // retain=true so any client (or the bot itself, if it restarts) gets the current state immediately on subscribe, without waiting for the next heartbeat
  bool ok = mqttClient.publish(MQTT_TOPIC, payload.c_str(), true);
 
  Serial.print("Published door state: ");
  Serial.print(payload);
  Serial.println(ok ? " [OK]" : " [FAILED]");
}

/** void connectWiFi()
 * @brief Connects to the WiFi network. Retries up to 20 times before restarting the ESP32 if it fails to connect.
 */
void connectWiFi() {
  Serial.println("Connecting to WiFi...");
  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WPA2_AUTH_PEAP, EAP_IDENTITY, EAP_USERNAME, EAP_PASSWORD);
 
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED) {
    if (retries++ > 20) {
      Serial.println("Failed to connect to WiFi, restarting...");
      ESP.restart();
    }
    Serial.print(".");
    delay(500);
  }
 
  Serial.println("\nConnected to WiFi");
  Serial.println(WiFi.localIP());
}
 
/** bool connectMQTT()
 * @brief Connects to the MQTT broker. 
 * @return Returns true if successful, false otherwise.
 */
bool connectMQTT() {
  Serial.print("Attempting MQTT connection...");
 
  bool connected = mqttClient.connect(MQTT_CLIENT_ID, MQTT_TOPIC, MQTT_LWT_QOS, MQTT_LWT_RETAIN, MQTT_LWT_MESSAGE);

  if (connected) {
    Serial.println("connected");
    publishDoorState();
  } else {
    Serial.print("failed, rc=");
    Serial.println(mqttClient.state());
  }
 
  return connected;
}
 
void setup() {
  pinMode(DOOR_SWITCH_PIN, INPUT_PULLUP);
 
  Serial.begin(115200);
  while (!Serial) {
    delay(10);
  }
 
  connectWiFi();

  // host-ip-address:port
  mqttClient.setServer(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
  mqttClient.setKeepAlive(15);
 
  connectMQTT();
}
 
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    unsigned long now = millis();
    if (now - lastWifiReconnectAttempt > 5000) {
      lastWifiReconnectAttempt = now;
      Serial.println("WiFi dropped, reconnecting...");
      connectWiFi();
    }
  }
 
  // MQTT watchdog (non-blocking)
  if (!mqttClient.connected()) {
    unsigned long now = millis();
    if (now - lastMqttReconnectAttempt > 5000) {
      lastMqttReconnectAttempt = now;
      connectMQTT();
    }
  } else {
    // must be called regularly to process pings / maintain the connection
    mqttClient.loop();
  }
 
  // Heartbeat publish
  unsigned long now = millis();
  if (now - lastPublish >= HEARTBEAT_INTERVAL) {
    lastPublish = now;
    if (mqttClient.connected()) {
      publishDoorState();
    }
  }
}
