'use client';

import { useApp } from './AppContext';
import { ChallengeErrorBoundary } from './ChallengeErrorBoundary';
import { BanSentSuccessOverlay } from './BanSentSuccessOverlay';
import { ResultOverlay } from './ResultOverlay';

/** Success/result modals isolated from home shell — check modal lives in Providers. */
export function ChallengeOverlays() {
  const {
    dismissIncoming,
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
            dismissIncoming();
          }}
          onAgain={() => {
            setBanSentOpen(false);
            dismissIncoming();
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
