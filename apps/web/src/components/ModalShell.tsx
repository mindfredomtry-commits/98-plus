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
}

export function ModalShell({
  open,
  onClose,
  children,
  zIndex = 60,
  ariaLabel = 'Диалог',
}: Props) {
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
          transition={{ duration: 0.2 }}
          className="modal-backdrop"
          style={{ zIndex }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
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
