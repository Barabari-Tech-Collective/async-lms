import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { isAxiosError } from "axios"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extracts a human-readable message from any thrown value.
 *
 * Priority:
 *  1. `error.response.data.message`  — backend validation/business error
 *  2. `error.response.data.error`    — some backends use this key
 *  3. `error.message`                — generic JS / network error
 *  4. `fallback`                     — caller-provided default
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const data = error.response?.data
    return data?.message || data?.error || error.message || fallback
  }
  if (error instanceof Error) {
    return error.message || fallback
  }
  if (typeof error === 'string' && error.trim()) {
    return error
  }
  return fallback
}
