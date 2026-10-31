const dns = require('dns').promises;
const net = require('net');

/**
 * Universal Pre-Submission URL Permission & Accessibility Guard
 * "The Zero Private Links Guard"
 *
 * Designed for high-concurrency deadline surges (200-500 students submitting concurrently).
 * Features:
 * - 3-Minute In-Memory LRU Cache to deduplicate probes.
 * - Outbound Semaphore (max 15 concurrent probes) to prevent socket & event-loop exhaustion.
 * - Hop-by-hop SSRF validation (checking every redirect Location header).
 * - Precision manual redirect detection (avoids Google 200 OK login page trap).
 * - GitHub HEAD probing with browser User-Agent (avoids 60 req/hr API rate limit).
 * - Fail-open policy on timeouts (>3.5s) & 429 rate limits so students never miss deadlines.
 */

// ── 1. Lightweight Zero-Dependency In-Memory LRU Cache (3-Minute TTL) ──
class SimpleLruCache {
  constructor(maxSize = 1000, ttlMs = 180000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    // Refresh access order (LRU)
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest (first key)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear() {
    this.cache.clear();
  }
}

const probeCache = new SimpleLruCache(2000, 180000); // 3-minute TTL

// ── 2. Lightweight Concurrency Semaphore (Max 15 Outbound Sockets) ──
class Semaphore {
  constructor(maxConcurrency = 15) {
    this.maxConcurrency = maxConcurrency;
    this.current = 0;
    this.queue = [];
  }

  acquire() {
    return new Promise((resolve) => {
      if (this.current < this.maxConcurrency) {
        this.current++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next(); // Directly hand off the execution slot to the next queued probe
    } else {
      this.current--;
    }
  }

  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const outboundLimiter = new Semaphore(15);

// ── 3. SSRF IP Blacklist & Validation ──
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 127) return true; // Loopback
    if (parts[0] === 10) return true;  // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 (Link-local & AWS Metadata)
    if (parts[0] === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80')
    ) {
      return true;
    }
  }
  return false;
}

async function assertSafeHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return false;
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain,text/csv,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const TIMEOUT_MS = 3500; // 3.5s deadline safety timeout

// ── 4. Platform Probers ──

/**
 * Probes Google Docs, Sheets, or Drive files using redirect: 'manual'.
 * When private, Google returns 302/307 to accounts.google.com/ServiceLogin.
 */
async function probeGoogleResource(probeUrl, platform) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let currentUrl = probeUrl;
    let res = null;

    for (let hop = 0; hop < 4; hop++) {
      const parsed = new URL(currentUrl);
      const isSafe = await assertSafeHost(parsed.hostname);
      if (!isSafe) {
        return {
          accessible: false,
          verdict: 'SSRF_BLOCKED',
          platform,
          message: 'Target host resolves to a restricted or private address.',
        };
      }

      res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: BROWSER_HEADERS,
        signal: controller.signal,
      });

      const location = res.headers.get('location');

      // If redirected to Google Login, it is 100% DEFINITE_RESTRICTED
      if (location) {
        if (
          location.includes('accounts.google.com') ||
          location.includes('ServiceLogin') ||
          location.includes('/signin')
        ) {
          return {
            accessible: false,
            verdict: 'DEFINITE_RESTRICTED',
            platform,
            message: 'Access Denied: Google reports that this document is private or restricted.',
            instructions:
              "Open your file in Google -> Click 'Share' (top right) -> Under 'General access', change from 'Restricted' to 'Anyone with the link can view' -> Ensure role is set to 'Viewer' -> Re-submit.",
          };
        }

        // If redirecting to content CDN or googleusercontent, follow it to confirm
        if (
          location.includes('googleusercontent.com') ||
          location.includes('docs.google.com') ||
          location.includes('drive.google.com')
        ) {
          currentUrl = new URL(location, currentUrl).href;
          continue;
        }
      }

      break;
    }

    if (!res) {
      return {
        accessible: true,
        verdict: 'TRANSIENT_FAIL_OPEN',
        platform,
        message: 'No response received. Allowed under deadline fail-open policy.',
      };
    }

    // 1. Explicit 401 / 403 Forbidden / Unauthorized
    if (res.status === 401 || res.status === 403) {
      return {
        accessible: false,
        verdict: 'DEFINITE_RESTRICTED',
        platform,
        message: 'Access Denied: Google reports that this document is private or restricted.',
        instructions:
          "Open your file in Google -> Click 'Share' (top right) -> Under 'General access', change from 'Restricted' to 'Anyone with the link can view' -> Ensure role is set to 'Viewer' -> Re-submit.",
      };
    }

    // 2. 404 Not Found or 400 Bad Request
    if (res.status === 404 || res.status === 400) {
      return {
        accessible: false,
        verdict: 'DEFINITE_RESTRICTED',
        platform,
        message: 'Document not found or private. Please verify the URL.',
        instructions:
          "Open your file in Google -> Click 'Share' (top right) -> Under 'General access', change from 'Restricted' to 'Anyone with the link can view' -> Ensure role is set to 'Viewer' -> Re-submit.",
      };
    }

    // 3. Rate Limit / Transient 5xx
    if (res.status === 429 || res.status >= 500) {
      return {
        accessible: true,
        verdict: 'TRANSIENT_FAIL_OPEN',
        platform,
        message: 'Google rate limit or service delay. Allowed under deadline fail-open policy.',
      };
    }

    // 4. 200 OK — inspect content-type and html content
    if (res.status === 200) {
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      // If we probed an export endpoint (/export?format=...) but received an HTML page,
      // verify it isn't an interstitial sign-in or permission-denied HTML page
      if (probeUrl.includes('/export?') && contentType.includes('text/html')) {
        const html = await res.text().catch(() => '');
        if (
          html.includes('accounts.google.com') ||
          html.includes('ServiceLogin') ||
          html.includes('Sign in') ||
          html.includes('Sign in - Google Accounts') ||
          html.includes('You need access') ||
          html.includes('Request access')
        ) {
          return {
            accessible: false,
            verdict: 'DEFINITE_RESTRICTED',
            platform,
            message: 'Access Denied: Google reports that this document requires sign-in or permission.',
            instructions:
              "Open your file in Google -> Click 'Share' (top right) -> Under 'General access', change from 'Restricted' to 'Anyone with the link can view' -> Ensure role is set to 'Viewer' -> Re-submit.",
          };
        }
      }

      return {
        accessible: true,
        verdict: 'ACCESSIBLE',
        platform,
      };
    }

    // 5. Remaining 302/303 redirects
    if (res.status === 302 || res.status === 303 || res.status === 307) {
      return {
        accessible: true,
        verdict: 'ACCESSIBLE',
        platform,
      };
    }

    return {
      accessible: false,
      verdict: 'DEFINITE_RESTRICTED',
      platform,
      message: `Google returned HTTP ${res.status}. Access could not be verified.`,
      instructions:
        "Open your file in Google -> Click 'Share' (top right) -> Under 'General access', change from 'Restricted' to 'Anyone with the link can view' -> Ensure role is set to 'Viewer' -> Re-submit.",
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return {
        accessible: true,
        verdict: 'TRANSIENT_FAIL_OPEN',
        platform,
        message: 'Probe timed out. Allowed under deadline fail-open policy.',
      };
    }
    return {
      accessible: true,
      verdict: 'TRANSIENT_FAIL_OPEN',
      platform,
      message: `Network glitch (${err.message}). Allowed under deadline fail-open policy.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probes GitHub repositories via HEAD https://github.com/{owner}/{repo} with browser User-Agent.
 * Bypasses GitHub unauthenticated REST API rate limit (60 req/hr).
 * Public repos return 200 OK. Private repos return 404 Not Found.
 */
async function probeGitHubRepo(rawUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const parsed = new URL(rawUrl);
    // Extract owner and repo (e.g. /owner/repo)
    const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)/);
    if (!match) {
      return {
        accessible: false,
        verdict: 'INVALID_URL',
        platform: 'github',
        message: 'Invalid GitHub repository link format.',
        instructions: 'Please enter a valid GitHub repository URL, e.g. https://github.com/owner/repo',
      };
    }

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');
    const probeUrl = `https://github.com/${owner}/${repo}`;

    const res = await fetch(probeUrl, {
      method: 'HEAD',
      redirect: 'manual',
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });

    if (res.status === 200) {
      return {
        accessible: true,
        verdict: 'ACCESSIBLE',
        platform: 'github',
      };
    }

    if (res.status === 404 || res.status === 401 || res.status === 403) {
      return {
        accessible: false,
        verdict: 'DEFINITE_RESTRICTED',
        platform: 'github',
        message: 'Access Denied: GitHub repository is private or does not exist.',
        instructions:
          "Open your repository on GitHub -> Go to 'Settings' -> Scroll down to 'Danger Zone' -> Click 'Change visibility' -> Select 'Make public' -> Re-submit.",
      };
    }

    if (res.status === 429 || res.status >= 500) {
      return {
        accessible: true,
        verdict: 'TRANSIENT_FAIL_OPEN',
        platform: 'github',
        message: 'GitHub rate limit or service delay. Allowed under deadline fail-open policy.',
      };
    }

    return {
      accessible: false,
      verdict: 'DEFINITE_RESTRICTED',
      platform: 'github',
      message: `GitHub returned HTTP ${res.status}. Access could not be verified.`,
      instructions:
        "Open your repository on GitHub -> Go to 'Settings' -> Scroll down to 'Danger Zone' -> Click 'Change visibility' -> Select 'Make public' -> Re-submit.",
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return {
        accessible: true,
        verdict: 'TRANSIENT_FAIL_OPEN',
        platform: 'github',
        message: 'GitHub probe timed out. Allowed under deadline fail-open policy.',
      };
    }
    return {
      accessible: true,
      verdict: 'TRANSIENT_FAIL_OPEN',
      platform: 'github',
      message: `Network error (${err.message}). Allowed under deadline fail-open policy.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probes OneDrive / SharePoint URLs.
 * Private links redirect to login.live.com or login.microsoftonline.com.
 */
async function probeOneDrive(rawUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });

    const location = res.headers.get('location') || '';
    if (
      location.includes('login.live.com') ||
      location.includes('login.microsoftonline.com') ||
      location.includes('error.aspx')
    ) {
      return {
        accessible: false,
        verdict: 'DEFINITE_RESTRICTED',
        platform: 'onedrive',
        message: 'Access Denied: Microsoft requires sign-in to view this link.',
        instructions:
          "Open your file in OneDrive -> Click 'Share' -> Select 'Anyone with the link can view' (do NOT select 'People in my organization') -> Copy link and re-submit. Alternatively, export as .xlsx or file and upload directly.",
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        accessible: false,
        verdict: 'DEFINITE_RESTRICTED',
        platform: 'onedrive',
        message: 'Access Denied: Microsoft reports this OneDrive item is private or requires sign-in.',
        instructions:
          "Open your file in OneDrive -> Click 'Share' -> Select 'Anyone with the link can view' -> Re-submit.",
      };
    }

    if (res.status === 404) {
      return {
        accessible: false,
        verdict: 'DEFINITE_RESTRICTED',
        platform: 'onedrive',
        message: 'OneDrive file not found. Please verify the URL.',
      };
    }

    if (res.status === 429 || res.status >= 500) {
      return {
        accessible: true,
        verdict: 'TRANSIENT_FAIL_OPEN',
        platform: 'onedrive',
        message: 'OneDrive rate limit or service delay. Allowed under deadline fail-open policy.',
      };
    }

    if (res.status === 200 || res.status === 302 || res.status === 303) {
      return {
        accessible: true,
        verdict: 'ACCESSIBLE',
        platform: 'onedrive',
      };
    }

    return {
      accessible: false,
      verdict: 'DEFINITE_RESTRICTED',
      platform: 'onedrive',
      message: `OneDrive returned HTTP ${res.status}. Access could not be verified.`,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return {
        accessible: true,
        verdict: 'TRANSIENT_FAIL_OPEN',
        platform: 'onedrive',
        message: 'OneDrive probe timed out. Allowed under deadline fail-open policy.',
      };
    }
    return {
      accessible: true,
      verdict: 'TRANSIENT_FAIL_OPEN',
      platform: 'onedrive',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probes Figma files.
 * Anonymous requests to private files render "<meta property=\"og:title\" content=\"Log in to Figma\">".
 */
async function probeFigma(rawUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });

    const location = res.headers.get('location') || '';
    if (location.includes('/login') || location.includes('figma.com/login')) {
      return {
        accessible: false,
        verdict: 'DEFINITE_RESTRICTED',
        platform: 'figma',
        message: 'Access Denied: Figma file requires sign-in.',
        instructions:
          "Open your file in Figma -> Click 'Share' (top right) -> Under 'Anyone with the link', change to 'can view' -> Re-submit your link.",
      };
    }

    if (res.status === 200) {
      const text = await res.text();
      const first16k = text.slice(0, 16384);
      if (
        first16k.includes('Log in to Figma') ||
        first16k.includes('content="Log in to Figma"')
      ) {
        return {
          accessible: false,
          verdict: 'DEFINITE_RESTRICTED',
          platform: 'figma',
          message: 'Access Denied: Figma file requires sign-in.',
          instructions:
            "Open your file in Figma -> Click 'Share' (top right) -> Under 'Anyone with the link', change to 'can view' -> Re-submit your link.",
        };
      }
      return { accessible: true, verdict: 'ACCESSIBLE', platform: 'figma' };
    }

    if (res.status === 404) {
      return {
        accessible: false,
        verdict: 'DEFINITE_RESTRICTED',
        platform: 'figma',
        message: 'Figma file not found or private.',
      };
    }

    return { accessible: true, verdict: 'ACCESSIBLE', platform: 'figma' };
  } catch (err) {
    return {
      accessible: true,
      verdict: 'TRANSIENT_FAIL_OPEN',
      platform: 'figma',
      message: err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generic fallback prober for general URLs.
 */
async function probeGenericUrl(rawUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(rawUrl, {
      method: 'HEAD',
      redirect: 'manual',
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      return {
        accessible: false,
        verdict: 'DEFINITE_RESTRICTED',
        platform: 'general_url',
        message: `HTTP ${res.status} Access Denied: The URL requires authentication.`,
        instructions: 'Please make sure your project or website is publicly accessible.',
      };
    }

    return {
      accessible: true,
      verdict: 'ACCESSIBLE',
      platform: 'general_url',
    };
  } catch (err) {
    return {
      accessible: true,
      verdict: 'TRANSIENT_FAIL_OPEN',
      platform: 'general_url',
      message: err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── 5. Main Entry Point ──

/**
 * Validates and probes a submission URL.
 * Wrapped with In-Memory LRU Cache and Semaphore Concurrency Limiter.
 *
 * @param {string} rawUrl - The URL provided by the student
 * @returns {Promise<{
 *   accessible: boolean;
 *   verdict: 'ACCESSIBLE' | 'DEFINITE_RESTRICTED' | 'TRANSIENT_FAIL_OPEN' | 'INVALID_URL' | 'SSRF_BLOCKED';
 *   platform: string;
 *   message?: string;
 *   instructions?: string;
 *   fromCache?: boolean;
 * }>}
 */
async function probeUrlAccess(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return {
      accessible: false,
      verdict: 'INVALID_URL',
      platform: 'unknown',
      message: 'Please provide a valid URL.',
    };
  }

  const cleanUrl = rawUrl.trim();

  // 1. Check LRU Cache
  const cached = probeCache.get(cleanUrl);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  // 2. Syntax & Protocol Validation
  let parsed;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    return {
      accessible: false,
      verdict: 'INVALID_URL',
      platform: 'unknown',
      message: 'Invalid URL format. Please include http:// or https://',
    };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return {
      accessible: false,
      verdict: 'INVALID_URL',
      platform: 'unknown',
      message: `Disallowed URL protocol '${parsed.protocol}'. Only http: and https: are allowed.`,
    };
  }

  // 3. SSRF Host Validation
  const hostSafe = await assertSafeHost(parsed.hostname);
  if (!hostSafe) {
    return {
      accessible: false,
      verdict: 'SSRF_BLOCKED',
      platform: 'unknown',
      message: 'Target URL resolves to a private or restricted network address.',
    };
  }

  // 4. Concurrency-Throttled Probe Execution
  const result = await outboundLimiter.run(async () => {
    const host = parsed.hostname.toLowerCase();

    // A. Google Docs
    if (host === 'docs.google.com' && parsed.pathname.includes('/document/d/')) {
      const docId = parsed.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)?.[1];
      if (!docId) {
        return {
          accessible: false,
          verdict: 'INVALID_URL',
          platform: 'google_docs',
          message: 'Could not extract Google Document ID from URL.',
        };
      }
      const probeUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
      return await probeGoogleResource(probeUrl, 'google_docs');
    }

    // B. Google Sheets
    if (host === 'docs.google.com' && parsed.pathname.includes('/spreadsheets/d/')) {
      const sheetId = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
      if (!sheetId) {
        return {
          accessible: false,
          verdict: 'INVALID_URL',
          platform: 'google_sheets',
          message: 'Could not extract Google Spreadsheet ID from URL.',
        };
      }
      const probeUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      return await probeGoogleResource(probeUrl, 'google_sheets');
    }

    // C. Google Drive Files
    if (
      (host === 'drive.google.com' || host === 'docs.google.com') &&
      (parsed.pathname.includes('/file/d/') || parsed.searchParams.get('id'))
    ) {
      const fileId =
        parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
        parsed.searchParams.get('id');
      if (!fileId) {
        return {
          accessible: false,
          verdict: 'INVALID_URL',
          platform: 'google_drive',
          message: 'Could not extract Google Drive file ID from URL.',
        };
      }
      const probeUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      return await probeGoogleResource(probeUrl, 'google_drive');
    }

    // D. Google Drive Folders
    if (host === 'drive.google.com' && parsed.pathname.includes('/drive/folders/')) {
      const folderId = parsed.pathname.match(/\/drive\/folders\/([a-zA-Z0-9_-]+)/)?.[1];
      if (!folderId) {
        return {
          accessible: false,
          verdict: 'INVALID_URL',
          platform: 'google_drive',
          message: 'Could not extract Google Drive folder ID from URL.',
        };
      }
      const probeUrl = `https://drive.google.com/drive/folders/${folderId}`;
      return await probeGoogleResource(probeUrl, 'google_drive');
    }

    // E. GitHub Repositories
    if (host === 'github.com' || host === 'www.github.com') {
      return await probeGitHubRepo(cleanUrl);
    }

    // F. OneDrive & SharePoint
    if (
      host.includes('1drv.ms') ||
      host.includes('onedrive.live.com') ||
      host.includes('sharepoint.com')
    ) {
      return await probeOneDrive(cleanUrl);
    }

    // G. Figma Files
    if (host === 'figma.com' || host === 'www.figma.com') {
      return await probeFigma(cleanUrl);
    }

    // H. Generic Public URL
    return await probeGenericUrl(cleanUrl);
  });

  // Store in cache (cache only conclusive verdicts: ACCESSIBLE or DEFINITE_RESTRICTED)
  if (result.verdict === 'ACCESSIBLE' || result.verdict === 'DEFINITE_RESTRICTED') {
    probeCache.set(cleanUrl, result);
  }

  return result;
}

module.exports = {
  probeUrlAccess,
  isPrivateIp,
  assertSafeHost,
  probeCache,
};
