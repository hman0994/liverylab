/**
 * TGA (Targa) Image Encoder / Decoder
 * Supports:
 *   - Type 2:  Uncompressed true-color (24-bit or 32-bit)
 *   - Type 10: RLE-compressed true-color (24-bit or 32-bit)
 * Used to read iRacing template files and export paints in the TGA format
 * that iRacing expects in Documents\iRacing\paint\[car]\
 */
const TGA = (() => {

  /**
   * Encode a canvas ImageData object into a 32-bit uncompressed TGA file.
   * Pixels are written in standard TGA bottom-to-top, BGRA order.
   *
   * @param {ImageData} imageData   Canvas pixel data (RGBA, top-to-bottom)
   * @returns {Uint8Array}          Raw TGA file bytes ready for download
   */
  function encode(imageData) {
    const { width, height, data } = imageData;
    const headerSize = 18;
    const pixelBytes = width * height * 4;
    const buf = new Uint8Array(headerSize + pixelBytes);
    const view = new DataView(buf.buffer);

    // ── TGA Header (18 bytes) ───────────────────────────────────────────────
    buf[0]  = 0;      // ID field length (no ID string)
    buf[1]  = 0;      // Colour-map type: none
    buf[2]  = 2;      // Image type:  uncompressed true-colour
    // Bytes 3-7: colour-map spec — all zero (no colour map)
    view.setUint16(8,  0,     true);   // X-origin
    view.setUint16(10, 0,     true);   // Y-origin
    view.setUint16(12, width, true);   // Width
    view.setUint16(14, height, true);  // Height
    buf[16] = 32;   // Pixel depth: 32-bit BGRA
    buf[17] = 0x08; // Image descriptor: 8-bit alpha channel, bottom-left origin

    // ── Pixel Data ─────────────────────────────────────────────────────────
    // TGA standard = bottom-to-top row order, pixels stored as BGRA
    let offset = headerSize;
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        buf[offset++] = data[i + 2]; // B
        buf[offset++] = data[i + 1]; // G
        buf[offset++] = data[i + 0]; // R
        buf[offset++] = data[i + 3]; // A
      }
    }

    return buf;
  }

  /**
   * Decode a TGA ArrayBuffer into a PNG data-URL string that the browser
   * can display or use as a Fabric.js image source.
   * Handles types 2 (uncompressed) and 10 (RLE-compressed), 24/32-bit.
   *
   * @param {ArrayBuffer} buffer   Raw bytes from a .tga file
   * @returns {string}             data:image/png;base64,…  string
   */
  function decode(buffer) {
    const bytes = new Uint8Array(buffer);
    const view  = new DataView(buffer);

    // ── Parse header ───────────────────────────────────────────────────────
    const idLength     = bytes[0];
    const colorMapType = bytes[1];
    const imageType    = bytes[2];
    // Colour-map spec: bytes 3-7
    const cmFirstEntry = view.getUint16(3, true);
    const cmLength     = view.getUint16(5, true);
    const cmEntrySize  = bytes[7];  // bits per entry
    // Image spec
    const width        = view.getUint16(12, true);
    const height       = view.getUint16(14, true);
    const pixelDepth   = bytes[16];
    const imageDesc    = bytes[17];
    const topToBottom  = (imageDesc & 0x20) !== 0; // bit 5 = origin

    if (width === 0 || height === 0) {
      throw new Error('TGA: invalid dimensions');
    }
    if (imageType !== 2 && imageType !== 10) {
      throw new Error('TGA: unsupported image type ' + imageType + '. Only types 2 and 10 are supported.');
    }
    if (pixelDepth !== 24 && pixelDepth !== 32) {
      throw new Error('TGA: unsupported pixel depth ' + pixelDepth + '. Only 24-bit and 32-bit are supported.');
    }

    // Skip header + optional ID string + colour-map data
    const cmByteSize = Math.ceil(cmLength * cmEntrySize / 8);
    let offset = 18 + idLength + cmByteSize;

    // Build output ImageData on a temporary canvas
    const canvas = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    const ctx     = canvas.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    const dest    = imgData.data;

    const bytesPerPixel = pixelDepth / 8;
    const totalPixels   = width * height;

    // Helper: read one pixel from `bytes` at current `offset`, return [r,g,b,a]
    const readPixel = () => {
      const b = bytes[offset++];
      const g = bytes[offset++];
      const r = bytes[offset++];
      const a = bytesPerPixel === 4 ? bytes[offset++] : 255;
      return [r, g, b, a];
    };

    // Helper: write [r,g,b,a] into dest at pixel index pIdx,
    //         honouring the TGA origin flag
    const writePixel = (pIdx, pixel) => {
      const row  = Math.floor(pIdx / width);
      const col  = pIdx % width;
      const destRow = topToBottom ? row : (height - 1 - row);
      const di   = (destRow * width + col) * 4;
      dest[di]     = pixel[0]; // R
      dest[di + 1] = pixel[1]; // G
      dest[di + 2] = pixel[2]; // B
      dest[di + 3] = pixel[3]; // A
    };

    let pixelIndex = 0;

    if (imageType === 2) {
      // ── Uncompressed ─────────────────────────────────────────────────────
      while (pixelIndex < totalPixels && offset < bytes.length) {
        writePixel(pixelIndex++, readPixel());
      }
    } else {
      // ── RLE-compressed (type 10) ──────────────────────────────────────────
      while (pixelIndex < totalPixels && offset < bytes.length) {
        const header  = bytes[offset++];
        const count   = (header & 0x7F) + 1;
        const isRLE   = (header & 0x80) !== 0;

        if (isRLE) {
          // Repetition packet: one pixel repeated `count` times
          const pixel = readPixel();
          for (let i = 0; i < count && pixelIndex < totalPixels; i++) {
            writePixel(pixelIndex++, pixel);
          }
        } else {
          // Raw packet: `count` literal pixels
          for (let i = 0; i < count && pixelIndex < totalPixels; i++) {
            writePixel(pixelIndex++, readPixel());
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  return { encode, decode };
})();
