//
// JPEG marker layout, for protecting the tables a decoder needs. Reads only segment
// lengths, like Media-Glitcher's jpeg.py; it never decodes the image.
//

const SOI = 0xd8;
const SOS = 0xda;
// markers without a length field: TEM and the restarts RST0-RST7
const NO_LENGTH = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);

//
// Returns the offset of the first byte after a JPEG's start-of-scan segment (FF DA and
// its length), where the compressed picture starts. Everything before it is tables and
// headers, so it makes a good headerBytes. Returns null for a file that isn't a JPEG or
// whose markers break off before a start of scan
//
export function jpegScanStart(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== SOI) {
    return null;
  }
  let pos = 2;
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) {
      return null;
    }
    // extra FF bytes before a marker are padding
    while (bytes[pos] === 0xff) {
      pos++;
    }
    const marker = bytes[pos++];
    if (NO_LENGTH.has(marker)) {
      continue;
    }
    // the length counts its own two bytes
    const length = (bytes[pos] << 8) | bytes[pos + 1];
    if (length < 2 || pos + length > bytes.length) {
      return null;
    }
    pos += length;
    if (marker === SOS) {
      return pos;
    }
  }
  return null;
}
