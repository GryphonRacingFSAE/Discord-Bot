#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>

#include "config.h" // Include the configuration data

#define DOOR_SENSOR_PIN 15

int current_state;
int last_state;

// Function declaration
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
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
  }
  Serial.println("Connected: " + String(WIFI_SSID));

  // Set up the door sensor pin as an input with pull-up resistor
  pinMode(DOOR_SENSOR_PIN, INPUT_PULLUP);

  // Initial reading of the door sensor
  current_state = digitalRead(DOOR_SENSOR_PIN);
  sendDoorState(current_state);
}

void loop() {
  // Save the last door state and read the current door state
  last_state = current_state;
  current_state = digitalRead(DOOR_SENSOR_PIN);

  // Check if the door state changed
  if (last_state == LOW && current_state == HIGH) {
    Serial.println("\nDoor opened");
    sendDoorState(current_state); // Call the function to send door state to the server
  } else if (last_state == HIGH && current_state == LOW) {
    Serial.println("\nDoor closed");
    sendDoorState(current_state); // Call the function to send door state to the server
  }
}

// Function to send door state to the server
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
    Serial.println("HTTP response code: " + http_response_code);
  } else {
    Serial.println("Error sending state to server");
  }

  // Clean up and close the HTTP connection
  http.end();
}