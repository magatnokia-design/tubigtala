#pragma once
// Averaging over the reading interval (0.3.2). In a header, not in the .ino, because the Arduino
// build adds function prototypes at the top of the .ino - before a struct defined there exists.
#include <math.h>
#include <stdint.h>

// Samples taken since the previous reading. A sample with no value (NAN: board not detected,
// clipped, gas warming up) counts as missing.
struct Avg {
  float sum = 0;
  uint16_t n = 0;
  uint16_t missing = 0;
};

inline void addSample(Avg& a, float v) {
  if (isnan(v)) a.missing++;
  else { a.sum += v; a.n++; }
}

// Average since the previous reading, then start over. `instant` is used when nothing was sampled
// yet (the first reading after boot). NAN when most samples had no value - as one missing sample
// gave before averaging.
inline float takeAverage(Avg& a, float instant) {
  float v = (a.n + a.missing == 0) ? instant : (a.n > 0 && a.n >= a.missing ? a.sum / a.n : NAN);
  a = Avg();
  return v;
}

inline bool nothingSampled(const Avg& a) { return a.n + a.missing == 0; }
