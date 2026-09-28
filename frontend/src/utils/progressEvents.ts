/**
 * Utility to notify the application of course progress updates.
 * Dispatches both a local window DOM event and updates localStorage
 * to sync progress across different open browser tabs/windows.
 */
export const notifyCourseProgressUpdated = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('course-progress-updated'));
    try {
      localStorage.setItem('codeguru-progress-updated', Date.now().toString());
    } catch {
      // Ignore quota or disabled localStorage errors
    }
  }
};
