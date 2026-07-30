/**
 * Miniapp page — coordinator owns the application surface.
 * Page content is not a competing Product/Notification owner.
 */
'use client';

import { useAppServices } from '@/app-services/AppServicesProvider';
import { ShellErrorBoundary } from '@/components/ShellErrorBoundary';

const APP_SHELL_BUILD = 'app-coordinator-phase2-v1';

export default function HomePage() {
  const { error } = useAppServices();

  return (
    <div
      className="app-shell app-shell--coordinator"
      data-build={APP_SHELL_BUILD}
    >
      <ShellErrorBoundary name="app-shell" fallback={null}>
        {error ? (
          <div className="pt-16 pb-8 text-center text-sm text-red-400">
            {error}
          </div>
        ) : null}
      </ShellErrorBoundary>
    </div>
  );
}
