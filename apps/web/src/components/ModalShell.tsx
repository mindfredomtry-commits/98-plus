'use client';

import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';
import { logOverlayTransition } from '@/lib/overlay-transition-debug';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** z-index layer — modals 60, sheets 55 */
  zIndex?: number;
  ariaLabel?: string;
  /** Faster tween — for result cards on mobile WebView */
  light?: boolean;
  /** Tap outside card to dismiss (default true) */
  closeOnBackdrop?: boolean;
  /** Extra class on the card panel */
  cardClassName?: string;
  /** Skip re-animation when only children change (success modal). */
  stable?: boolean;
  /** Instant swap during notification queue handoff — no enter/exit delay. */
  handoff?: boolean;
}

export function ModalShell({
  open,
  onClose,
  children,
  zIndex = 60,
  ariaLabel = 'Диалог',
  light = false,
  closeOnBackdrop = true,
  cardClassName = '',
  stable = false,
  handoff = false,
}: Props) {
  const instant = stable || handoff;
  const cardTransition = instant
    ? { duration: 0 }
    : light
      ? { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const }
      : { type: 'spring' as const, damping: 26, stiffness: 320 };
  const backdropTransition = instant
    ? { duration: 0 }
    : light
      ? { duration: 0.14 }
      : { duration: 0.2 };

  useEffect(() => {
    if (!open) return;
    acquireScrollLock();
    if (!instant) {
      const ms = light ? 160 : 320;
      logOverlayTransition('[TRANSITION DELAY USED]', {
        source: 'ModalShell-framer-enter',
        ms,
        light,
        handoff,
        stable,
      });
    }
    return () => releaseScrollLock();
  }, [handoff, instant, light, open, stable]);

  if (handoff && open) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="modal-backdrop modal-backdrop--light modal-backdrop--handoff modal-backdrop--handoff-static"
        style={{ zIndex }}
        onClick={closeOnBackdrop ? onClose : undefined}
      >
        <div
          className={`modal-card modal-card--handoff${cardClassName ? ` ${cardClassName}` : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="modal-shell"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          initial={instant ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={instant ? undefined : { opacity: 0 }}
          transition={instant ? { duration: 0 } : backdropTransition}
          className={`modal-backdrop${light ? ' modal-backdrop--light' : ''}${
            handoff ? ' modal-backdrop--handoff' : ''
          }`}
          style={{ zIndex }}
          onClick={closeOnBackdrop ? onClose : undefined}
        >
          <motion.div
            initial={
              instant
                ? false
                : { opacity: 0, scale: light ? 0.97 : 0.94, y: light ? 6 : 12 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              instant
                ? undefined
                : { opacity: 0, scale: light ? 0.98 : 0.96, y: light ? 4 : 8 }
            }
            transition={instant ? { duration: 0 } : cardTransition}
            className={`modal-card${cardClassName ? ` ${cardClassName}` : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
