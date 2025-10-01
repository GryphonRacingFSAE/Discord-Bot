#include <Arduino.h>
#include <ArduinoJson.h>
#include <Wifi.h>
#include <HTTPClient.h>
#include <esp_wpa2.h>

#define DOOR_SWITCH_PIN 9
#define HEARTBEAT_INTERVAL 3000 

#define WIFI_SSID "uog-wifi-secure"
#define SERVER_URL "10.12.202.218:5000" // Replace with your local computer's IP address

#define EAP_USERNAME "ngocanhk"
#define EAP_IDENTITY "ngocanhk"
#define EAP_PASSWORD "password"

void sendDoorState() {
  String shop_status = digitalRead(DOOR_SWITCH_PIN) == HIGH ? "CLOSED" : "OPEN";

  HTTPClient http;
  String server_url = "http://" SERVER_URL "/update_shop_status";
  
  if(http.begin(server_url)) {
    Serial.println("Connected to server"); 
  } else {
    Serial.println("Failed to connect to server");
    return;
  } 

  Serial.println("Sending door state: " + shop_status); 
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["shop-status"] = shop_status; 

  int http_response_code = http.POST(doc.as<String>());

  if(http_response_code > 0) {
    Serial.println("HTTP Response code: " + String(http_response_code));
  } else {
    Serial.println("Error code: " + String(http_response_code));
  }

  http.end();
}

void setup() {
  pinMode(DOOR_SWITCH_PIN, INPUT_PULLUP);
  
  Serial.begin(115200);
  while(!Serial) {
    delay(10);
  }
  
  Serial.println("Connecting to WiFi...\n");
  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WPA2_AUTH_PEAP, EAP_IDENTITY, EAP_USERNAME, EAP_PASSWORD);

  int retries = 0;
  while(WiFi.status() != WL_CONNECTED) 
  {
    if(retries++ > 10) 
    {
      Serial.println("Failed to connect to WiFi");
      ESP.restart();
    }
    Serial.print(".");
    Serial.print(WiFi.status());
    delay(1000);
  }

  Serial.println("\nConnected to WiFi");

  Serial.println(WiFi.broadcastIP());
  Serial.println(WiFi.gatewayIP()); 
  Serial.println(WiFi.subnetMask());
  Serial.println(WiFi.macAddress());
  Serial.println(WiFi.localIP());
}

void loop() {
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

  sendDoorState();
  delay(HEARTBEAT_INTERVAL); // Send door state at the specified interval
}
