// Browser-only helpers for getting data off the device. Prefers the native share sheet
// (iOS/Android PWAs have no real "Downloads" folder), falls back to an <a download>.
export async function shareOrDownloadText(filename, text, mime = 'text/plain') {
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
