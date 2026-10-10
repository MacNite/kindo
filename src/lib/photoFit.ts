/**
 * How the photo frame fits a picture to its screen. Filling the screen crops
 * whatever sticks out; that is fine while it is a sliver, but a portrait photo
 * on a landscape screen (or a panorama) would lose most of itself, often the
 * heads. Past `maxCrop`, the whole photo is shown instead, over a blurred copy
 * of itself rather than black bars.
 */
export type PhotoFit = "cover" | "contain";

export function photoFit(image: { width: number; height: number }, box: { width: number; height: number }, maxCrop = 0.2): PhotoFit {
  if (!(image.width > 0 && image.height > 0 && box.width > 0 && box.height > 0)) return "cover";
  const r = (image.width / image.height) / (box.width / box.height);
  // The share of the photo cut away when it fills the box.
  return 1 - Math.min(r, 1 / r) > maxCrop ? "contain" : "cover";
}
