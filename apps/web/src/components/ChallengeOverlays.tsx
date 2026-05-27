'use client';

import { useApp } from './Providers';
import { ChallengeErrorBoundary } from './ChallengeErrorBoundary';
import { BanSentSuccessOverlay } from './BanSentSuccessOverlay';

/** Success modal isolated from home shell — check/result modals live in Providers. */
export function ChallengeOverlays() {
  const { banSentOpen, setBanSentOpen } = useApp();

  return (
    <ChallengeErrorBoundary name="ban-sent">
      <BanSentSuccessOverlay
        open={banSentOpen}
        onDone={() => {
          setBanSentOpen(false);
        }}
        onAgain={() => {
          setBanSentOpen(false);
        }}
      />
    </ChallengeErrorBoundary>
  );
}
