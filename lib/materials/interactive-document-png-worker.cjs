"use strict";
const { parentPort, workerData } = require("node:worker_threads");
const { createInflate } = require("node:zlib");
const { PNG } = require("pngjs");
const { crc32 } = require("pngjs/lib/crc");

async function validate() {
    const png = Buffer.from(workerData);
    if (png.length > 2 * 1024 * 1024 || png.readUInt32BE(8) !== 13 || png.toString("ascii", 12, 16) !== "IHDR") throw new Error();
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20), depth = png[24], color = png[25], interlace = png[28];
    const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
    if (!width || !height || width > 4096 || height > 4096 || width * height > 16_000_000 || !depths[color]?.includes(depth) || png[26] !== 0 || png[27] !== 0 || interlace > 1) throw new Error();

    const idat = [];
    let offset = 8, endedData = false, ended = false, hasPalette = false;
    while (offset < png.length) {
      if (offset + 12 > png.length) throw new Error();
      const length = png.readUInt32BE(offset), type = png.toString("latin1", offset + 4, offset + 8), end = offset + 12 + length;
      if (!/^[A-Za-z]{4}$/.test(type) || end > png.length || crc32(png.subarray(offset + 4, end - 4)) !== png.readInt32BE(end - 4) || (type === "IHDR" && offset !== 8) || ["acTL", "fcTL", "fdAT"].includes(type)) throw new Error();
      if (type === "PLTE") {
        if (hasPalette || idat.length || !length || length > 768 || length % 3) throw new Error();
        hasPalette = true;
      }
      if (type === "IDAT") {
        if (endedData) throw new Error();
        idat.push(png.subarray(offset + 8, end - 4));
      } else if (idat.length) endedData = true;
      if (type === "IEND") {
        if (length || end !== png.length || !idat.length) throw new Error();
        ended = true;
        break;
      }
      offset = end;
    }
    if (!ended) throw new Error();
    const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
    const expected = passes.reduce((sum, [x, y, dx, dy]) => {
      const w = Math.max(0, Math.ceil((width - x) / dx)), h = Math.max(0, Math.ceil((height - y) / dy));
      return sum + (w && h ? (Math.ceil(w * channels[color] * depth / 8) + 1) * h : 0);
    }, 0);
    const compressed = Buffer.concat(idat);
    const inflater = createInflate();
    let size = 0;
    inflater.end(compressed);
    for await (const chunk of inflater) {
      size += chunk.length;
      if (size > expected) throw new Error();
    }
    if (size !== expected || inflater.bytesWritten !== compressed.length) throw new Error();
    PNG.sync.read(png, { checkCRC: true });
}
validate().then(() => parentPort.postMessage(true), () => parentPort.postMessage(false));
