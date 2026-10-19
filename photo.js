// Prepares a person's photo on this device before upload: centre-cropped to a square of at most
// 512 pixels and re-encoded as JPEG, which also drops hidden details such as where it was taken.
const MAX_BYTES = 500_000;
export async function squarePhoto(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Choose a photo (for example JPEG, PNG or WebP).");
  if (file.size > 25_000_000) throw new Error("Choose a photo smaller than 25 MB.");
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("That photo could not be read. Try another one, or save it as a JPEG first."); }
  const side = Math.min(bitmap.width, bitmap.height), size = Math.min(512, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare photos.");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close?.();
  for (const quality of [0.85, 0.75, 0.6]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("That photo is too detailed even after shrinking. Try another one.");
}
