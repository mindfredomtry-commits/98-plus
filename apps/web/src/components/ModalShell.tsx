'use client';

import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** z-index layer — modals 60, sheets 55 */
  zIndex?: number;
  ariaLabel?: string;
  /** Faster tween — for result cards on mobile WebView */
  light?: boolean;
}

export function ModalShell({
  open,
  onClose,
  children,
  zIndex = 60,
  ariaLabel = 'Диалог',
  light = false,
}: Props) {
  const cardTransition = light
    ? { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const }
    : { type: 'spring' as const, damping: 26, stiffness: 320 };
  const backdropTransition = light ? { duration: 0.14 } : { duration: 0.2 };
  useEffect(() => {
    if (!open) return;
    acquireScrollLock();
    return () => releaseScrollLock();
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="modal-shell"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={backdropTransition}
          className={`modal-backdrop${light ? ' modal-backdrop--light' : ''}`}
          style={{ zIndex }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: light ? 0.97 : 0.94, y: light ? 6 : 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: light ? 0.98 : 0.96, y: light ? 4 : 8 }}
            transition={cardTransition}
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
