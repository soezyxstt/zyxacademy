export const audioCheckSources = {
  low: { label: "Nada rendah", frequency: 440, duration: 8 },
  high: { label: "Nada tinggi", frequency: 660, duration: 12 },
} as const;

export type AudioCheckSource = keyof typeof audioCheckSources;

// Original verification fixtures. These are synthesized sine waves with short fades,
// written as mono 16-bit PCM WAV. They contain no recordings or third-party assets.
export function createAudioCheckWave(source: AudioCheckSource): Uint8Array<ArrayBuffer> {
  if (!Object.hasOwn(audioCheckSources, source)) throw new Error("Sumber audio tidak dikenal.");
  const { frequency, duration } = audioCheckSources[source];
  const sampleRate = 8_000;
  const sampleCount = duration * sampleRate;
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const wave = new DataView(bytes.buffer);

  wave.setUint32(0, 0x52494646); // RIFF
  wave.setUint32(4, bytes.length - 8, true);
  wave.setUint32(8, 0x57415645); // WAVE
  wave.setUint32(12, 0x666d7420); // fmt
  wave.setUint32(16, 16, true);
  wave.setUint16(20, 1, true);
  wave.setUint16(22, 1, true);
  wave.setUint32(24, sampleRate, true);
  wave.setUint32(28, sampleRate * 2, true);
  wave.setUint16(32, 2, true);
  wave.setUint16(34, 16, true);
  wave.setUint32(36, 0x64617461); // data
  wave.setUint32(40, sampleCount * 2, true);

  for (let sample = 0; sample < sampleRate; sample++) {
    const beat = sample / sampleRate;
    const envelope = Math.max(0, Math.min(1, beat / 0.02, (0.55 - beat) / 0.06));
    const amplitude = 3_200 * envelope * Math.sin(2 * Math.PI * frequency * beat);
    wave.setInt16(44 + sample * 2, Math.round(amplitude), true);
  }
  for (let second = 1; second < duration; second++) {
    bytes.copyWithin(44 + second * sampleRate * 2, 44, 44 + sampleRate * 2);
  }

  return bytes;
}
