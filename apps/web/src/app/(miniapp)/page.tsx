/**
 * Phase 0 miniapp page — AppServices + DirectNotificationHost only.
 * Legacy Providers / InstantBanFlow notification host is not mounted.
 */
'use client';

import { useAppServices } from '@/app-services/AppServicesProvider';
import { ShellErrorBoundary } from '@/components/ShellErrorBoundary';

/** Bump when diagnosing shell / deploy mismatches. */
const APP_SHELL_BUILD = 'direct-host-phase0-v1';

export default function HomePage() {
  const {
    token,
    user,
    loading,
    error,
    authReady,
    sendFlowRequested,
    bansSectionRequested,
  } = useAppServices();

  return (
    <div className="app-shell app-shell--direct-host" data-build={APP_SHELL_BUILD}>
      <ShellErrorBoundary name="app-shell" fallback={null}>
        {loading && !authReady ? (
          <div className="pt-16 pb-8 text-center text-muted text-sm">
            Загрузка…
          </div>
        ) : null}

        {error ? (
          <div className="pt-16 pb-8 text-center text-sm text-red-400">
            {error}
          </div>
        ) : null}

        {user ? (
          <div className="pt-12 pb-8 px-4 text-center">
            <p className="text-muted text-sm">
              @{user.username ?? user.firstName}
            </p>
            {sendFlowRequested > 0 ? (
              <p className="text-xs text-muted mt-2">
                Send flow requested ({sendFlowRequested}) — product WHO/WHAT
                shell TBD
              </p>
            ) : null}
            {bansSectionRequested > 0 ? (
              <p className="text-xs text-muted mt-2">
                Bans section requested ({bansSectionRequested})
              </p>
            ) : null}
            {!token ? (
              <p className="text-xs text-muted mt-2">Нет сессии</p>
            ) : null}
          </div>
        ) : null}
      </ShellErrorBoundary>
    </div>
  );
}
