import { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '@/services/api';
import type {
  UrlPermissionStatus,
  UrlPermissionVerdict,
} from '@/components/common/assignment/UrlPermissionStatusBanner';

export function useUrlPermissionGuard(url: string, enabled: boolean) {
  const [status, setStatus] = useState<UrlPermissionStatus>({
    verdict: null,
    accessible: true,
    isChecking: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedUrlRef = useRef<string>('');

  const statusRef = useRef<UrlPermissionStatus>(status);
  statusRef.current = status;

  const checkUrl = useCallback(
    async (targetUrl: string, immediate = false): Promise<UrlPermissionStatus> => {
      const cleanUrl = targetUrl.trim();
      if (!cleanUrl) {
        const cleared: UrlPermissionStatus = {
          verdict: null,
          accessible: true,
          isChecking: false,
        };
        setStatus(cleared);
        lastCheckedUrlRef.current = '';
        return cleared;
      }

      // Basic regex check before hitting server
      try {
        new URL(cleanUrl);
      } catch {
        const invalid: UrlPermissionStatus = {
          verdict: 'INVALID_URL',
          accessible: false,
          message: 'Please enter a valid URL (e.g. starting with https://)',
          isChecking: false,
        };
        setStatus(invalid);
        return invalid;
      }

      // If already checked this exact URL and verdict is conclusive, reuse it
      const currentStatus = statusRef.current;
      if (
        lastCheckedUrlRef.current === cleanUrl &&
        currentStatus.verdict &&
        !currentStatus.isChecking &&
        !immediate
      ) {
        return currentStatus;
      }

      // Abort previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setStatus((prev) => ({ ...prev, isChecking: true }));

      try {
        const res = await apiClient.post<{
          success: boolean;
          data: {
            accessible: boolean;
            verdict: UrlPermissionVerdict;
            platform?: string;
            message?: string;
            instructions?: string;
          };
        }>(
          '/students/assignments/verify-url-access',
          { url: cleanUrl },
          { signal: abortControllerRef.current.signal }
        );

        const data = res.data.data;
        const result: UrlPermissionStatus = {
          verdict: data.verdict,
          accessible: data.accessible,
          platform: data.platform,
          message: data.message,
          instructions: data.instructions,
          isChecking: false,
        };

        lastCheckedUrlRef.current = cleanUrl;
        setStatus(result);
        return result;
      } catch (err: any) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
          return statusRef.current; // Ignored abort
        }

        // On transient error, fail open with warning so students never miss deadlines
        const failOpen: UrlPermissionStatus = {
          verdict: 'TRANSIENT_FAIL_OPEN',
          accessible: true,
          message: 'Verification service delayed. Deadline safety active.',
          isChecking: false,
        };
        setStatus(failOpen);
        return failOpen;
      }
    },
    []
  );

  // Debounced auto-check when user types or pastes a URL
  useEffect(() => {
    if (!enabled || !url.trim()) {
      setStatus({ verdict: null, accessible: true, isChecking: false });
      lastCheckedUrlRef.current = '';
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      checkUrl(url);
    }, 600);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [url, enabled, checkUrl]);

  return {
    permissionStatus: status,
    checkUrl,
    recheck: () => checkUrl(url, true),
    resetPermission: () =>
      setStatus({ verdict: null, accessible: true, isChecking: false }),
  };
}
