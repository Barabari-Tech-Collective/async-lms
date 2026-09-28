/**
 * Extracts an 11-character YouTube video ID from various URL formats or raw ID string.
 * Returns null if the URL is invalid or incomplete.
 */
export function extractYouTubeVideoId(urlStr?: string | null): string | null {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const trimmed = urlStr.trim();
  if (!trimmed) return null;

  // Check if string is already a direct 11-character video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Regex matching standard watch, share (youtu.be), embed, and shorts formats
  const match = trimmed.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  );
  if (match && match[1] && match[1].length === 11) {
    return match[1];
  }

  // URL parsing fallback
  try {
    const parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    }
    if (parsed.hostname === 'youtu.be') {
      const pathId = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (pathId && /^[a-zA-Z0-9_-]{11}$/.test(pathId)) return pathId;
    }
  } catch {
    // ignore malformed URLs
  }

  return null;
}

/**
 * Returns a standardized YouTube embed URL.
 */
export function getYouTubeEmbedUrl(urlStr?: string | null): string | null {
  const videoId = extractYouTubeVideoId(urlStr);
  if (!videoId) return null;
  return `https://www.youtube.com/embed/${videoId}?rel=0`;
}
