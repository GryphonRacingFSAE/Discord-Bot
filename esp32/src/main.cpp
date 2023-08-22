#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_wpa2.h>

void sendDoorState();

#define DOOR_SENSOR_PIN 15
#define HEARTBEAT_INTERVAL 3000

#undef SERVER_IP
// This is the IP of the embedded's shop computer
#define SERVER_IP "10.2.49.188"
// #define SERVER_IP "10.12.218.6"

#define WIFI_SSID "uog-wifi-secure"

// Ignore config variables for now:
#define EAP_ANONYMOUS_IDENTITY "anonymous@uoguelph.ca"
#define EAP_USERNAME "dhart04@uoguelph.ca"
#define EAP_IDENTITY "dhart04@uoguelph.ca"

void setup() {
    // Set the door sensor pin as input with pull-up resistor
    pinMode(DOOR_SENSOR_PIN, INPUT_PULLUP);

    // Initialize serial communication
    Serial.begin(115200);
    while (!Serial) {
        delay(100);
    }
    Serial.println("\nConnecting to WiFi...");
    WiFi.disconnect(true);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WPA2_AUTH_PEAP, EAP_IDENTITY, EAP_USERNAME, EAP_PASSWORD); 

    int retries = 0;
    while (WiFi.status() != WL_CONNECTED) {
        if (retries++ > 10) {
            Serial.println("\nFailed to connect to WiFi");
            ESP.restart();
        }
        Serial.print(".");
        Serial.print(WiFi.status());
        delay(1000);
    }
    Serial.println("\nWifi connected");

    Serial.println(WiFi.broadcastIP());
    Serial.println(WiFi.gatewayIP());
    Serial.println(WiFi.subnetMask());
    Serial.println(WiFi.macAddress());
    Serial.println(WiFi.localIP());
}

void loop() {
    sendDoorState();
    delay(HEARTBEAT_INTERVAL); // Send door state at the specified interval
    Serial.print("RSSI: ");
    Serial.println(WiFi.RSSI());

    int retries = 0;
    while (WiFi.status() != WL_CONNECTED) {
        if (retries++ > 10) {
            Serial.println("\nFailed to reconnect to WiFi");
            ESP.restart();
        }
        Serial.print(".");
        Serial.print(WiFi.status());
        delay(1000);
    }
}

void sendDoorState() {
    // Read the door sensor state
    int door_state = digitalRead(DOOR_SENSOR_PIN);

    HTTPClient http;
    String server_url = "http://" SERVER_IP "/update_door_status";

    // Connect to the server URL
    if (http.begin(server_url)) {
        Serial.println("Connected to server");
    } else {
        Serial.println("Failed to connect to server");
        return;
    }             

    Serial.print("Sending door state: ");
    Serial.println(door_state == HIGH ? "OPEN" : "CLOSED");                
    http.addHeader("Content-Type", "application/json"); // Set the content type header

    // Create JSON payload
    String json_payload = "{\"state\": \"" + String(door_state == HIGH ? "OPEN" : "CLOSED") + "\"}";

    // Send POST request with payload
    int http_response_code = http.POST(json_payload);

    if (http_response_code > 0) {
        Serial.printf("HTTP response code: %d\n", http_response_code);
    } else {
        Serial.printf("HTTP request failed, code: %d error: %s\n", http_response_code, http.errorToString(http_response_code).c_str());
    }

    // Close the HTTP connection
    http.end();
}