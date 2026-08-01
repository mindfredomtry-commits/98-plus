/**
 * Stage 7 Phase 2 — map transport source labels to RuntimeSource.
 */
import type { RuntimeSource } from './notification-runtime.types';

export function mapProvidersSourceToRuntime(source: string): RuntimeSource {
  const s = source.toLowerCase();
  if (s.includes('bootstrap') || s.includes('startup') || s.includes('hydrate')) {
    return 'bootstrap';
  }
  if (s.includes('deeplink')) return 'deeplink';
  if (
    s.includes('websocket') ||
    s.includes(':ws') ||
    s.endsWith('-ws') ||
    s.includes('ws-')
  ) {
    return 'websocket';
  }
  if (s.includes('poll')) return 'poll';
  if (s.includes('recover')) return 'recovery';
  if (
    s.includes('dismiss') ||
    s.includes('user-answer') ||
    s.includes('user') ||
    s.includes('result-cta')
  ) {
    return 'user';
  }
  if (s.includes('test')) return 'test';
  return 'system';
}
