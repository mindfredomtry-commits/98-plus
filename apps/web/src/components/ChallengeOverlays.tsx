'use client';

import { useApp } from './Providers';
import { ChallengeErrorBoundary } from './ChallengeErrorBoundary';
import { CheckOverlay } from './CheckOverlay';
import { BanSentSuccessOverlay } from './BanSentSuccessOverlay';
import { ResultOverlay } from './ResultOverlay';

/** Challenge modals isolated from home shell — crashes fall back to home. */
export function ChallengeOverlays() {
  const {
    dismissIncoming,
    clearCheckOverlay,
    banSentOpen,
    setBanSentOpen,
    result,
    dismissBanResult,
  } = useApp();

  const recoverCheck = () => clearCheckOverlay();

  return (
    <>
      <ChallengeErrorBoundary name="check" onRecover={recoverCheck}>
        <CheckOverlay />
      </ChallengeErrorBoundary>
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
