'use client';

import { useApp } from './Providers';
import { ChallengeErrorBoundary } from './ChallengeErrorBoundary';
import { BanSentSuccessOverlay } from './BanSentSuccessOverlay';
import { ResultOverlay } from './ResultOverlay';

/** Success/result modals isolated from home shell — check modal lives in Providers. */
export function ChallengeOverlays() {
  const {
    banSentOpen,
    setBanSentOpen,
    result,
    dismissBanResult,
  } = useApp();

  return (
    <>
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
      <ChallengeErrorBoundary name="result">
        {result ? (
          <ResultOverlay result={result} onClose={dismissBanResult} />
        ) : null}
      </ChallengeErrorBoundary>
    </>
  );
}
