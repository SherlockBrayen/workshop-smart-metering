// edge/dataGenerator.js
// Pola konsumsi per kamar: base load + variasi waktu + noise

const BASE_LOAD = {
  1: 150,  // Kamar 101 — 150W base (AC + lampu)
  2: 120,  // Kamar 102
  3: 200,  // Kamar 103 — lebih boros
  4: 100,  // Kamar 201 — hemat
  5: 175,  // Kamar 202
};

// Track accumulated energy per device
const accumulatedEnergy = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

function generate(deviceId) {
  const hour = new Date().getUTCHours();
  // Faktor waktu: malam (18-23) lebih tinggi, dini hari (0-6) rendah
  const timeFactor = (hour >= 18 || hour <= 6) ? 1.3 : 0.7;
  const noise = 0.9 + Math.random() * 0.2; // ±10% noise

  const power = BASE_LOAD[deviceId] * timeFactor * noise; // Watt
  const energyDelta = (power / 1000) * (10 / 3600);       // kWh per 10 detik

  return {
    room: deviceId,
    power:       parseFloat(power.toFixed(2)),
    voltage:     parseFloat((220 + (Math.random() * 4 - 2)).toFixed(2)),  // 218–222V
    current:     parseFloat((power / 220).toFixed(3)),
    energy:      parseFloat((accumulatedEnergy[deviceId] += energyDelta).toFixed(6)),
    energyDelta: parseFloat(energyDelta.toFixed(6)),
    frequency:   parseFloat((50 + (Math.random() * 0.4 - 0.2)).toFixed(2)),  // 49.8–50.2 Hz
    powerFactor: parseFloat((0.85 + Math.random() * 0.1).toFixed(3)),
    measuredAt:  new Date().toISOString(),
  };
}

module.exports = { generate };
