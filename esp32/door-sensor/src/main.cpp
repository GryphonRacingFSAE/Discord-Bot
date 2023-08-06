#include <Arduino.h>

#define DOOR_SENSOR_PIN 15

int current_state;
int last_state;

void setup() {
  Serial.begin(115200);
  pinMode(DOOR_SENSOR_PIN, INPUT_PULLUP);

  current_state = digitalRead(DOOR_SENSOR_PIN);
}

void loop() {
  last_state = current_state;
  current_state = digitalRead(DOOR_SENSOR_PIN);

  if (last_state == LOW && current_state == HIGH) {
    Serial.println("Open");
  } else if (last_state == HIGH && current_state == LOW) {
    Serial.println("Closed");
  }
}
