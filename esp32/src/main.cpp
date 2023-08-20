#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>

#include "config.h"

#define DOOR_SENSOR_PIN 15
#define HEARTBEAT_INTERVAL 60000

unsigned long previous_heartbeat_time = 0;

void sendDoorState();

void setup() {
    // Initialize serial communication
    Serial.begin(115200);
    while (!Serial)
        delay(100);
    Serial.println("\n");

    // Connect to WiFi using credentials
    Serial.println("Connecting to WiFi...");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED)
        delay(100);
    Serial.println("Connected: " + String(WIFI_SSID));

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

void sendDoorState() {
    // Read the door sensor state
    int door_state = digitalRead(DOOR_SENSOR_PIN);

    Serial.print("\nSending door state: ");
    Serial.println(door_state == HIGH ? "OPEN" : "CLOSED");

    HTTPClient http;

    http.begin(SERVER_URL);                             // Connect to the server URL
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