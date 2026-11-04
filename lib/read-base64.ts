// From the Reskale app: first written 2026-10-29, last changed 2026-10-29 (before this repo). See HACKATHON.md.
/** Read a local image file back as raw base64 (no data: prefix). */
export async function readBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const reader = new FileReader();
  return new Promise<string>((resolve, reject) => {
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
