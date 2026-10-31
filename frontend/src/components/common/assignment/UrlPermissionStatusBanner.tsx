import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Info,
} from 'lucide-react';

export type UrlPermissionVerdict =
  | 'ACCESSIBLE'
  | 'DEFINITE_RESTRICTED'
  | 'TRANSIENT_FAIL_OPEN'
  | 'INVALID_URL'
  | 'SSRF_BLOCKED';

export interface UrlPermissionStatus {
  verdict: UrlPermissionVerdict | null;
  accessible: boolean;
  platform?: string;
  message?: string;
  instructions?: string;
  isChecking?: boolean;
}

interface UrlPermissionStatusBannerProps {
  status: UrlPermissionStatus;
  onRecheck?: () => void;
  className?: string;
}

export const UrlPermissionStatusBanner: React.FC<UrlPermissionStatusBannerProps> = ({
  status,
  onRecheck,
  className = '',
}) => {
  const { verdict, accessible, platform, message, instructions, isChecking } = status;

  if (isChecking) {
    return (
      <div
        className={`flex items-center gap-2.5 rounded-xl border border-blue-200/80 bg-blue-50/70 px-4 py-3 text-sm text-blue-800 shadow-sm transition-all dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300 ${className}`}
      >
        <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
        <span className="font-medium">Testing link accessibility...</span>
        <span className="text-xs text-blue-600/80 dark:text-blue-400/80">
          (Verifying facilitators can grade this URL)
        </span>
      </div>
    );
  }

  // Not checked yet
  if (!verdict) return null;

  // 1. Definite Restricted (Requires Google login, private GitHub repo, etc.)
  if (verdict === 'DEFINITE_RESTRICTED') {
    return (
      <div
        className={`rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50/90 to-amber-50/40 p-4 shadow-sm transition-all dark:border-rose-900/60 dark:from-rose-950/40 dark:to-neutral-900/40 ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-rose-900 dark:text-rose-200">
                Action Required: Link is Private or Restricted
              </h4>
              {onRecheck && (
                <button
                  type="button"
                  onClick={onRecheck}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/80 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 shadow-xs hover:bg-rose-50 dark:border-rose-800 dark:bg-neutral-800 dark:text-rose-300 dark:hover:bg-neutral-700"
                >
                  <RefreshCw className="h-3 w-3" />
                  Check Again
                </button>
              )}
            </div>

            <p className="text-sm leading-relaxed text-rose-800 dark:text-rose-300">
              {message ||
                'This link requires sign-in or permission to view. Evaluators will not be able to grade this document.'}
            </p>

            {instructions && (
              <div className="mt-2.5 rounded-xl border border-rose-200/60 bg-white/80 p-3 text-xs leading-relaxed text-neutral-700 shadow-xs dark:border-rose-900/40 dark:bg-neutral-900/80 dark:text-neutral-300">
                <span className="font-semibold text-rose-800 dark:text-rose-300">
                  How to fix:
                </span>{' '}
                {instructions}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. SSRF Blocked / Invalid URL
  if (verdict === 'SSRF_BLOCKED' || verdict === 'INVALID_URL') {
    return (
      <div
        className={`flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 ${className}`}
      >
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 text-xs leading-relaxed">
          <p className="font-medium text-amber-950 dark:text-amber-200">
            {message || 'Invalid or inaccessible URL.'}
          </p>
          {instructions && <p className="mt-1 text-amber-800/80 dark:text-amber-300/80">{instructions}</p>}
        </div>
      </div>
    );
  }

  // 3. Transient Fail Open (Timeout / 429 Rate Limit)
  if (verdict === 'TRANSIENT_FAIL_OPEN') {
    return (
      <div
        className={`flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-xs text-slate-700 shadow-xs dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-300 ${className}`}
      >
        <Info className="h-4 w-4 shrink-0 text-slate-500 dark:text-neutral-400" />
        <span className="flex-1">
          Link access check timed out, but deadline safety is active — you can submit your work.
        </span>
        {onRecheck && (
          <button
            type="button"
            onClick={onRecheck}
            className="text-xs font-medium text-slate-600 underline hover:text-slate-900 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  // 4. Accessible (Publicly Verified)
  if (verdict === 'ACCESSIBLE' && accessible) {
    return (
      <div
        className={`flex items-center gap-2.5 rounded-xl border border-emerald-200/90 bg-emerald-50/80 px-3.5 py-2.5 text-xs font-medium text-emerald-800 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 ${className}`}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span>
          Public access confirmed. Facilitators and automated graders can view this {platform ? platform.replace('_', ' ') : 'deliverable'}.
        </span>
      </div>
    );
  }

  return null;
};
