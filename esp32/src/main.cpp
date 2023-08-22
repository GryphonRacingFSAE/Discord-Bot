#include <Arduino.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_wpa2.h>

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
        delay(1000);
    Serial.println("\n");

    // Initialize NVRAM storage
    preferences.begin("config", false);
    // Check if evironment variables were declared
    if (strlen(WIFI_SSID) != 0 && strlen(WIFI_PASSWORD) != 0 && strlen(SERVER_IP) != 0)
        saveConfigVariables(); // If they were, save them to NVRAM
    else
        readConfigVariables(); // If they weren't, read them from NVRAM
    preferences.end();

// Ignore config variables for now:
#define EAP_IDENTITY "erutten@uoguelph.ca"
#define EAP_PASSWORD "password"
    const char* ssid = "uog-wifi-secure";
    const char* test_root_ca =
        "-----BEGIN "
        "CERTIFICATE-----"
        "\nMIIEPjCCAyagAwIBAgIESlOMKDANBgkqhkiG9w0BAQsFADCBvjELMAkGA1UEBhMC\nVVMxFjAUBgNVBAoTDUVudHJ1c3QsIEluYy4xKDAmBgNVBAsTH1NlZSB3d3cuZW50\ncnVzdC"
        "5uZXQvbGVnYWwtdGVybXMxOTA3BgNVBAsTMChjKSAyMDA5IEVudHJ1c3Qs\nIEluYy4gLSBmb3IgYXV0aG9yaXplZCB1c2Ugb25seTEyMDAGA1UEAxMpRW50cnVz\ndCBSb290IENlcn"
        "RpZmljYXRpb24gQXV0aG9yaXR5IC0gRzIwHhcNMDkwNzA3MTcy\nNTU0WhcNMzAxMjA3MTc1NTU0WjCBvjELMAkGA1UEBhMCVVMxFjAUBgNVBAoTDUVu\ndHJ1c3QsIEluYy4xKDAmBg"
        "NVBAsTH1NlZSB3d3cuZW50cnVzdC5uZXQvbGVnYWwt\ndGVybXMxOTA3BgNVBAsTMChjKSAyMDA5IEVudHJ1c3QsIEluYy4gLSBmb3IgYXV0\naG9yaXplZCB1c2Ugb25seTEyMDAGA1"
        "UEAxMpRW50cnVzdCBSb290IENlcnRpZmlj\nYXRpb24gQXV0aG9yaXR5IC0gRzIwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK\nAoIBAQC6hLZy254Ma+"
        "KZ6TABp3bqMriVQRrJ2mFOWHLP/vaCeb9zYQYKpSfYs1/T\nRU4cctZOMvJyig/"
        "3gxnQaoCAAEUesMfnmr8SVycco2gvCoe9amsOXmXzHHfV1IWN\ncCG0szLni6LVhjkCsbjSR87kyUnEO6fe+1R9V77w6G7CebI6C1XiUJgWMhNcL3hW\nwcKUs/"
        "Ja5CeanyTXxuzQmyWC48zCxEXFjJd6BmsqEZ+pCm5IO2/b1BEZQvePB7/"
        "1\nU1+cPvQXLOZprE4yTGJ36rfo5bs0vBmLrpxR57d+tVOxMyLlbc9wPBr64ptntoP0\njaWvYkxN4FisZDQSA/i2jZRjJKRxAgMBAAGjQjBAMA4GA1UdDwEB/"
        "wQEAwIBBjAP\nBgNVHRMBAf8EBTADAQH/"
        "MB0GA1UdDgQWBBRqciZ60B7vfec7aVHUbI2fkBJmqzAN\nBgkqhkiG9w0BAQsFAAOCAQEAeZ8dlsa2eT8ijYfThwMEYGprmi5ZiXMRrEPR9RP/\njTkrwPK9T3CMqS/"
        "qF8QLVJ7UG5aYMzyorWKiAHarWWluBh1+xLlEjZivEtRh2woZ\nRkfz6/djwUAFQKXSt/S1mja/"
        "qYh2iARVBCuch38aNzx+LaUa2NSJXsq9rD1s2G2v\n1fN2D807iDginWyTmsQ9v4IbZT+mD12q/OWyFcq1rca8PdCE6OoGcrBNOTJ4vz4R\nnAuknZoh8/"
        "CbCzB428Hch0P+vGOaysXCHMnHjf87ElgI5rY97HosTvuDls4MPGmH\nVHOkc8KT/1EQrBVUAdj8BbGJoX90g5pJ19xOe4pIb4tF9g==\n-----END CERTIFICATE-----\n";
    Serial.println("\nConnecting to WiFi...");
    WiFi.disconnect(true);
    WiFi.mode(WIFI_STA);
    esp_wifi_sta_wpa2_ent_set_username((uint8_t*)EAP_IDENTITY, strlen(EAP_IDENTITY));
    esp_wifi_sta_wpa2_ent_set_password((uint8_t*)EAP_PASSWORD, strlen(EAP_PASSWORD));
    esp_wifi_sta_wpa2_ent_enable();
    WiFi.begin(ssid);
    while (WiFi.status() != WL_CONNECTED)
        delay(100);
    Serial.println("Connected! (Part 1)");

    WiFiClientSecure client;
    client.setCACert(test_root_ca);
    Serial.println("Connected! (Part 2)");

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