# pH board setup (plug and play, firmware 0.3.0+)

Steps for fitting a new PH-4502C board and probe to a running TubigTala Station. No re-flash is
needed: since firmware 0.3.0 the station detects the board by its output voltage
(`PH_BOARD_MIN_MV` in `firmware/tubigtala/config.h`). With nothing on G34 the pin reads about
237 mV at the board side, so pH uploads as "no reading". Once a powered board outputs more than
600 mV, pH readings start.

Calibration itself is in [wiring.md](wiring.md#calibration) (app: Settings > Calibrate pH).

## What to prepare

| Item | Why |
|---|---|
| Buffer powders **6.86** and **4.01** (9.18 optional) | Two-point calibration; 9.18 only to check the result |
| Distilled or purified (bottled, not mineral) water, about 1 L | Dissolving the powders and rinsing the probe |
| 3 clean cups or jars with lids, labelled 6.86 / 4.01 / 9.18 | One per buffer, never mixed |
| Measuring cup (250 mL) | One sachet = 250 mL (check the sachet) |
| Tissue | Blot the probe dry; do not wipe the glass bulb |
| Laptop with USB cable (optional) | Faster zero setting with `pins` (1 reading per second instead of 1 per minute) |

Make the buffers the day before: dissolve each sachet in 250 mL distilled water, stir until clear,
close and label. Keep them at room temperature, out of the sun. Pour a small amount into a
separate cup for each use and throw that away after; never pour used buffer back. Made-up
buffer keeps about a month closed.

## 1. Wire the board (station unplugged)

Same pins as before ([wiring.md](wiring.md#pin-map)):

| pH board pin | Goes to |
|---|---|
| V+ | ESP32 **V5** (5 V) |
| G | ESP32 **GND** (left #14) |
| Po | **10 kΩ** -> G34, with **15 kΩ** from G34 to GND (the divider already on the board) |
| To, Do, second G | not connected |

Plug the probe into the BNC socket. Keep the probe tip in its storage cap or in 4.01 buffer.

## 2. Power on and check it is detected

Power the station (charger or laptop). Within 2 minutes the Water tab pH card shows a value
(marked uncalibrated) instead of "No reading". With the laptop: `diag` prints
`pH: G34 pin … mV -> board … mV -> pH …`; if it prints **pH board NOT DETECTED**, check V+, G and Po.
**CLIPPED** means the board output is above ~5.1 V: do step 3 first.

## 3. Set the zero (one time per board)

1. Unplug the probe. Short the BNC: a wire from the **centre hole** to the **outer metal shell**
   (this is "pH 7" for the board).
2. Turn the zero trimmer (the blue one nearest the BNC) slowly until the board side reads about
   **2500 mV** (G34 pin about 1500 mV). Watch it with `pins` on the laptop (once a second), or on
   **Settings > Calibrate pH** in the app (live mV, once a minute).
3. Remove the short, plug the probe back in.

This only centres the board; exact accuracy comes from the calibration. If the trimmer does not
move the voltage at all, the board is faulty (as on 5 Nov 2026) - do not calibrate it.

## 4. Soak the probe

New or dry probe: soak the bulb in **4.01 buffer** (or 3 mol/L KCl) for **at least 2 hours,
8 hours is best**. Calibrating an unsoaked probe gives drifting values.

## 5. Calibrate in the app

Settings > **Calibrate pH**, then follow the screen (details in [wiring.md](wiring.md#calibration)):

1. Rinse with distilled water, blot. Probe in **6.86**, choose **pH 6.86**, wait for **Stable**
   (about 3-5 minutes), **Save**.
2. Rinse, blot. Probe in **4.01**, choose **pH 4.01**, wait for Stable, **Save**.
3. Review: sensitivity should be roughly **150-200 mV per pH**. Below about 100 the probe is weak
   or not soaked. **Save calibration**. The station applies it within 10 minutes.

## 6. Check

Rinse, probe in **9.18** (or back in 6.86): the app should show that value within about **±0.2**.
If not, soak longer and calibrate again. Redo the calibration every few weeks.

## Probe care

- Store the tip wet: in its cap with 3 mol/L KCl, or 4.01 buffer. Never dry, never in distilled water.
- Rinse between liquids; blot, do not rub the glass bulb.
- Only the probe tip goes in water; the board stays dry in the enclosure.
