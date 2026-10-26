const cache = new Map<string, string>();

export function demoSource(id: string, duration: number) {
  const cached = cache.get(id);
  if (cached) return cached;
  const sampleRate = 22050;
  const count = Math.floor(duration * sampleRate);
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) =>
    [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + count * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, count * 2, true);
  const variation = Number(id.replace(/\D/g, '')) || 1;
  const root = [130.813, 146.832, 110, 123.471, 174.614, 138.591][(variation - 1) % 6];
  const progression = [1, 0.7937, 1.3348, 0.8909];
  const melody = [0, 7, 12, 4, 9, 7, 4, 2, 0, 4, 7, 14, 12, 9, 7, 4];
  for (let index = 0; index < count; index++) {
    const time = index / sampleRate;
    const chord = progression[Math.floor(time / 8) % progression.length];
    const frequency = root * chord;
    const envelope = Math.min(1, time / 3, (duration - time) / 4);
    const beat = time % 0.8;
    const note =
      root * 2 * Math.pow(2, melody[(Math.floor(time / 0.8) + variation * 2) % melody.length] / 12);
    const pad =
      (Math.sin(time * frequency * Math.PI * 2) +
        Math.sin(time * frequency * 1.4983 * Math.PI * 2) * 0.5 +
        Math.sin(time * frequency * 1.2599 * Math.PI * 2) * 0.35) *
      0.115;
    const bell =
      (Math.sin(time * note * Math.PI * 2) + Math.sin(time * note * 2.002 * Math.PI * 2) * 0.25) *
      Math.exp(-beat * 5) *
      Math.min(1, beat * 50) *
      0.14;
    const shimmer =
      Math.sin(time * frequency * 4.001 * Math.PI * 2) * (Math.sin(time * 0.7) + 1) * 0.012;
    view.setInt16(
      44 + index * 2,
      Math.max(-1, Math.min(1, (pad + bell + shimmer) * envelope)) * 32767,
      true,
    );
  }
  const source = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  cache.set(id, source);
  return source;
}
