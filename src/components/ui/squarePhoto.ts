/**
 * A picked photo as a small square JPEG data: URL, cut from its middle. The
 * browser does this before upload, so a 12 MP phone photo becomes about 30 kB.
 * Rejects what the browser cannot read as an image.
 */
export async function squarePhoto(file: Blob, size = 256): Promise<string> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const out = Math.min(size, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx || !side) throw new Error("no image");
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
  img.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
