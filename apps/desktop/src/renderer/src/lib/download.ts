/** Saves base64 bytes as a file through the browser download (works in Electron). */
export function downloadBase64(base64: string, fileName: string, type?: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], type ? { type } : {}));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** `kiemi-<title>-<yyyymmdd-hhmm>.<ext>` — title cleaned to letters, digits and dashes. */
export function reportFileName(title: string, ext: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  const slug = title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'report';
  return `kiemi-${slug}-${stamp}.${ext}`;
}
