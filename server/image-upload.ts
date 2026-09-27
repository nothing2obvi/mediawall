import { imageDimensions } from "./external-artwork.js";

export const maxUploadBytes = 10 * 1024 * 1024;
export interface ImageUpload { buffer: Buffer; mime: string; extension: string; width: number; height: number }
export function decodeImageUpload(data: unknown): ImageUpload {
  if (typeof data !== "string" || !data.length || data.length > Math.ceil(maxUploadBytes / 3) * 4 || (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))) {
    throw new Error("Choose a PNG, JPEG, WebP, or GIF image no larger than 10 MB");
  }
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length || buffer.length > maxUploadBytes) throw new Error("Image must be no larger than 10 MB");
  let mime = "", extension = "";
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) { mime = "image/png"; extension = "png"; }
  else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) { mime = "image/jpeg"; extension = "jpg"; }
  else if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") { mime = "image/webp"; extension = "webp"; }
  else if (["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) { mime = "image/gif"; extension = "gif"; }
  if (!mime) throw new Error("Unsupported image: use PNG, JPEG, WebP, or GIF");
  const size = extension === "gif" && buffer.length >= 10
    ? {width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8)} : imageDimensions(buffer);
  if (!size || size.width < 1 || size.height < 1 || size.width * size.height > 100_000_000) throw new Error("Invalid image dimensions (maximum 100 megapixels)");
  return {buffer, mime, extension, ...size};
}
