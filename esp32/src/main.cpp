#include <Arduino.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>

void saveConfigVariables();
void readConfigVariables();
void sendDoorState();

#define DOOR_SENSOR_PIN 15
#define HEARTBEAT_INTERVAL 60000

Preferences preferences;

String wifi_ssid;
String wifi_password;
String server_ip;

unsigned long previous_heartbeat_time = 0;

void setup() {
    // Initialize serial communication
    Serial.begin(115200);
    while (!Serial)
        delay(100);
    Serial.println("\n");

    // Initialize NVRAM storage
    preferences.begin("config", false);
    // Check if evironment variables were declared
    if (strlen(WIFI_SSID) != 0 && strlen(WIFI_PASSWORD) != 0 && strlen(SERVER_IP) != 0)
        saveConfigVariables(); // If they were, save them to NVRAM
    else
        readConfigVariables(); // If they weren't, read them from NVRAM
    preferences.end();

    // Connect to WiFi using credentials
    Serial.println("\nConnecting to WiFi...");
    WiFi.begin(wifi_ssid.c_str(), wifi_password.c_str());
    while (WiFi.status() != WL_CONNECTED)
        delay(100);
    Serial.println("Connected!");

    // Set the door sensor pin as input with pull-up resistor
    pinMode(DOOR_SENSOR_PIN, INPUT_PULLUP);

    // Send the initial door state
    sendDoorState();
}

void loop() {
    // Get current time in milliseconds
    unsigned long current_time = millis();

    if (current_time - previous_heartbeat_time >= HEARTBEAT_INTERVAL) {
        previous_heartbeat_time = current_time;
        sendDoorState(); // Send door state at the specified interval
    }
}

void saveConfigVariables() {
    Serial.println("Saving config variables...");

    // Store config data in NVRAM
    preferences.putString("wifi_ssid", String(WIFI_SSID));
    preferences.putString("wifi_password", String(WIFI_PASSWORD));
    preferences.putString("server_ip", String(SERVER_IP));

    // Update global variables
    wifi_ssid = String(WIFI_SSID);
    wifi_password = String(WIFI_PASSWORD);
    server_ip = String(SERVER_IP);

    Serial.println("Done!");
}

void readConfigVariables() {
    Serial.println("Reading config variables...");

    // Retrieve config data from NVRAM
    wifi_ssid = preferences.getString("wifi_ssid");
    wifi_password = preferences.getString("wifi_password");
    server_ip = preferences.getString("server_ip");

    Serial.println("Done!");
}

void sendDoorState() {
    // Read the door sensor state
    int door_state = digitalRead(DOOR_SENSOR_PIN);

    Serial.print("\nSending door state: ");
    Serial.println(door_state == HIGH ? "OPEN" : "CLOSED");

    HTTPClient http;
    String server_url = "http://" + server_ip + ":8080/update_door_status";

    http.begin(server_url);                             // Connect to the server URL
    http.addHeader("Content-Type", "application/json"); // Set the content type header

    // Create JSON payload
    String json_payload = "{\"state\": " + String(door_state) + "}";

    // Send POST request with payload
    int http_response_code = http.POST(json_payload);

    if (http_response_code > 0) {
        Serial.printf("HTTP response code: %d\n", http_response_code);
        Serial.println(http.getString()); // Print server response
    } else {
        Serial.printf("HTTP request failed, error: %s\n", http.errorToString(http_response_code).c_str());
    }

    // Close the HTTP connection
    http.end();
}