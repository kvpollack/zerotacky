// Browser-only helpers for getting data off the device. Prefers the native share sheet
// (iOS/Android PWAs have no real "Downloads" folder), falls back to an <a download>.
// BLD-04: a CSV gets a UTF-8 byte-order mark and an explicit charset at this boundary, so Excel opened by double-click
// reads accents and the em dash as UTF-8 instead of Windows-1252. The pure CSV builders stay BOM-free for tests and copy.
export const CSV_BOM = '\uFEFF';
export function withCsvBom(text) {
  return text.startsWith(CSV_BOM) ? text : CSV_BOM + text;
}

export async function shareOrDownloadText(filename, text, mime = 'text/plain') {
  const isCsv = /^text\/csv\b/.test(mime);
  if (isCsv) { text = withCsvBom(text); if (!/charset=/i.test(mime)) mime = 'text/csv;charset=utf-8'; }
  const blob = new Blob([text], { type: mime });
  // Share sheet only on touch devices (phones/tablets); desktops get a straight download.
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (touch && typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}
