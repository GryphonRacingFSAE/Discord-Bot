#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>

#include "config.h"

#define DOOR_SENSOR_PIN 15
#define DEBOUNCE_DELAY 500

int current_state;
int last_state;
unsigned long last_debounce_time = 0;

void sendDoorState(int state);

void setup() {
  // Initialize serial communication for debugging
  Serial.begin(115200);
  while (!Serial)
    delay(100);
  Serial.println("\n");

  // Connect to WiFi
  Serial.println("Connecting to WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED)
    delay(100);
  Serial.println("Connected: " + String(WIFI_SSID));

  // Set up the door sensor pin as an input with pull-up resistor
  pinMode(DOOR_SENSOR_PIN, INPUT_PULLUP);

  // Initial reading of the door sensor
  current_state = digitalRead(DOOR_SENSOR_PIN);
  Serial.println(current_state == HIGH ? "\nDoor opened" : "\nDoor closed");
  sendDoorState(current_state);
}

void loop() {
  int raw_state = digitalRead(DOOR_SENSOR_PIN);

  // If the raw state changes, reset the debounce timer
  if (raw_state != last_state)
    last_debounce_time = millis();

  // Check if the debounce delay has passed since the last change
  if ((millis() - last_debounce_time) > DEBOUNCE_DELAY) {
    // Check if the raw state differs from the current state
    if (raw_state != current_state) {
      // Update the current state and print the door status
      current_state = raw_state;
      Serial.println(current_state == HIGH ? "\nDoor opened" : "\nDoor closed");

      // Send the door state to the server
      sendDoorState(current_state);
    }
  }

  // Update the last state for the next iteration
  last_state = raw_state;
}

void sendDoorState(int state) {
  Serial.println("Sending door state...");

  // Initialize an HTTP client instance
  HTTPClient http;

  // Specify the server URL and add the required headers
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  // Prepare the POST data
  String json_payload = "{\"state\": " + String(state) + "}";

  // Send the POST request and get the response code
  int http_response_code = http.POST(json_payload);

  // Display the HTTP response code or an error message
  if (http_response_code > 0) {
    Serial.printf("HTTP response code: %d\n", http_response_code);
    Serial.println(http.getString());
  } else {
    Serial.printf("HTTP request failed, error: %s\n", http.errorToString(http_response_code).c_str());
  }

  // Clean up and close the HTTP connection
  http.end();
}