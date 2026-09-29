function wave(seconds = 3, hz = 440) {
  const size = Math.floor(seconds * 32000) * 2; const b = Buffer.alloc(44 + size);
  b.write('RIFF', 0); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(32000, 24); b.writeUInt32LE(64000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(size, 40);
  for (let i = 0; i < size / 2; i++) b.writeInt16LE(Math.round(9000 * Math.sin(i / 32000 * Math.PI * 2 * hz)), 44 + i * 2);
  return b;
}
module.exports = { wave };
