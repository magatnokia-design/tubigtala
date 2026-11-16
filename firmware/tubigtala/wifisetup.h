// Wi-Fi with self-setup from a phone (firmware 0.4.0; docs/device-setup.md, "Wi-Fi setup").
#pragma once
#include <Arduino.h>

// In setup(): connects to the known network, or opens the setup network if there is none.
void wifiBegin();
// In loop(): keeps the connection, watches the BOOT button, runs the setup page while open.
void wifiLoop();
// Opens the setup network on purpose (serial `wifi`), even while online - to change networks.
void wifiOpenSetup();
// Forgets the network saved by the setup page (serial `forget`); secrets.h's, if any, is used again.
void wifiForget();
// One or two lines for `diag`. Never prints a password.
void wifiPrintStatus();
// The network the station connects to, or "" if none is known.
const char* wifiNetworkName();
