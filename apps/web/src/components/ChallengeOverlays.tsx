'use client';

import { useApp } from './Providers';
import { ChallengeErrorBoundary } from './ChallengeErrorBoundary';
import { IncomingBanOverlay } from './IncomingBanOverlay';
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
    setResult,
  } = useApp();

  const recoverIncoming = () => dismissIncoming();
  const recoverCheck = () => clearCheckOverlay();

  return (
    <>
      <ChallengeErrorBoundary name="incoming" onRecover={recoverIncoming}>
        <IncomingBanOverlay />
      </ChallengeErrorBoundary>
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
          <ResultOverlay result={result} onClose={() => setResult(null)} />
        ) : null}
      </ChallengeErrorBoundary>
    </>
  );
}
