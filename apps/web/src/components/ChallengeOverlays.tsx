'use client';

import { useApp } from './Providers';
import { ChallengeErrorBoundary } from './ChallengeErrorBoundary';
import { BanSentSuccessOverlay } from './BanSentSuccessOverlay';
/** Success modal isolated from home shell — check/result modals live in Providers. */
export function ChallengeOverlays() {
  const {
    dismissIncoming,
    banSentOpen,
    setBanSentOpen,
  } = useApp();

  return (
    <>
      <ChallengeErrorBoundary name="ban-sent">
        <BanSentSuccessOverlay
          open={banSentOpen}
          onDone={() => {
            setBanSentOpen(false);
            dismissIncoming();
          }}
          onAgain={() => {
            setBanSentOpen(false);
            dismissIncoming();
          }}
        />
      </ChallengeErrorBoundary>
    </>
  );
}
