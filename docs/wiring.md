# Wiring and calibration plan

After wiring and calibration, provision and flash the board with `docs/device-setup.md`.

Status: **planned, unverified (24 Oct 2026).** No hardware is in hand yet. Every pin, voltage and value below is a plan to check against the actual modules when they arrive. Update this file with what was measured, and mark each item verified.

## Board

ESP32 DevKit (ESP32-WROOM-32). 3.3 V logic. **No ESP32 pin tolerates 5 V.**

Analog inputs use **ADC1 only** (GPIO 32–39). ADC2 pins stop working while Wi-Fi is on.

## Pin map

| Sensor | Module pin | ESP32 pin | Notes |
|---|---|---|---|
| DS18B20 (waterproof probe) | DATA (yellow) | GPIO 4 | 4.7 kΩ pull-up from DATA to 3.3 V. |
| DS18B20 | VDD (red) | 3.3 V | |
| DS18B20 | GND (black) | GND | |
| pH module (e.g. PH-4502C) | Po (analog out) | GPIO 34 (ADC1_CH6) | Through a voltage divider, see below. Input-only pin. |
| pH module | V+ / G | 5 V / GND | Most pH boards need 5 V. Check yours. |
| MQ-137 module | AO (analog out) | GPIO 35 (ADC1_CH7) | Through a voltage divider. Input-only pin. |
| MQ-137 module | VCC / GND | 5 V / GND | The heater draws ~150 mA. Check the USB supply can handle it. |

All grounds must be shared (ESP32, pH board, MQ-137 board).

## Voltage dividers (check before connecting)

pH and MQ-137 boards powered at 5 V can output up to ~5 V. Before wiring to the ESP32:

1. Power the module alone and measure its analog output with a multimeter at its highest (MQ-137: in ammonia vapour or a few minutes after power-on; pH: probe in pH 4 buffer or shorted, per board docs).
2. If it can exceed 3.1 V, use a divider. Planned: **10 kΩ (top) / 20 kΩ (bottom)**, ratio 0.667. 5.0 V in becomes 3.33 V at the pin. Slightly over 3.1 V, so for margin consider 10 kΩ / 15 kΩ (ratio 0.6, 5.0 V → 3.0 V).
3. Put the actual ratio in `firmware/tubigtala/config.h` (`PH_DIVIDER_RATIO`, `NH3_DIVIDER_RATIO`). Firmware divides by it so stored mV values are the module's own output.

## Calibration

### pH (two-point, neutral and acid buffer) - done in the app, no re-flashing

Buffers: either a **7.00 / 4.00** kit or the common **6.86 / 4.01 / 9.18** powder kit (the 9.18 is not needed). Powder sachets: dissolve one in 250 mL distilled water in a clean container; label it. The app uses the buffer's **true** value: treating 6.86 as 7.00 would shift every reading by about 0.15-0.25 pH. Values are as printed for 25 °C; buffer temperature effects are not corrected.

Probe care (from the probe's manual): before first use, or after long storage, soak the bulb and junction for 8 hours in 3 mol/L KCl storage solution, or in the pH 4.01 buffer if there is no KCl. Store it the same way; never dry and never in distilled water. If the probe has a fill hole, slide its rubber sleeve off while measuring.

1. Let the probe and buffers reach room temperature. Rinse the probe with distilled water between buffers.
2. App: **Settings > Device > Calibrate pH**. Choose your neutral buffer (**pH 7.00** or **pH 6.86**), put the probe in it and wait for **Stable** (3 readings within 5 mV - about 3 minutes at one reading a minute), then **Save pH … point**.
3. Rinse, choose your acid buffer (**pH 4.00** or **pH 4.01**), probe in it, wait for Stable, **Save pH … point**, review, **Save calibration**. The buffer values are saved with the calibration (`ph7BufferPh` / `ph4BufferPh`).
4. The board picks it up within 10 minutes (serial: `[cloud] pH calibration applied: pH 6.86 = … mV, pH 4.01 = … mV`) and keeps it in flash.
5. Check: back in the neutral buffer, the reported pH should be within ±0.1 of that buffer's value (e.g. 6.86).

Until then, readings use the nominal `PH7_MV`/`PH4_MV` in `config.h`, carry `phCalibrated: false`, and the app labels pH as uncalibrated.

### DS18B20

Factory calibrated (±0.5 °C). Sanity check against a known thermometer in the same water. `-127` = disconnected, `85.0` at power-on = not yet converted; both are stored as `null`.

### MQ-137

Needs 24–48 h burn-in when new and ~2–3 min warm-up after each power-on. Firmware sends `null` for `nh3GasMv` during the warm-up window (`NH3_WARMUP_MS`).

Without a reference gas and known conditions, its output is **relative only**. It measures ammonia gas in the air, so place it in the headspace above the water, not in the water. Never present its value as ppm or as dissolved ammonia.

## Water and power safety

- Only the pH probe tip and the DS18B20 waterproof probe go in water. Boards, MQ-137 and ESP32 stay dry, ideally in an enclosure.
- Low voltage only (USB 5 V). No mains.
