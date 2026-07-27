/** Haptics for lobby CTA blocked / low-energy reveal — shared with repeat-ban guard. */
export function triggerLobbyBlockedHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([12, 40, 12]);
    }
    (
      window as Window & {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: {
              notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
            };
          };
        };
      }
    ).Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('warning');
  } catch {
    // no-op
  }
}
