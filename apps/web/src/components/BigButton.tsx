'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  clearPillSourceIf,
  reportPillSource,
} from '@/lib/pill-source-debug';

interface Props {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'danger' | 'ghost';
  disabled?: boolean;
  className?: string;
}

export function BigButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
}: Props) {
  useEffect(() => {
    reportPillSource('BigButton');
    return () => clearPillSourceIf('BigButton');
  }, [variant, disabled, children]);

  const styles = {
    primary:
      'bg-accent text-white shadow-glow hover:brightness-110 active:scale-[0.98]',
    danger: 'bg-warning/20 text-warning border border-warning/40',
    ghost: 'bg-card text-white border border-white/10',
  };

  return (
    <motion.button
      type="button"
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      onClick={onClick}
      disabled={disabled}
      data-pill-source="BigButton"
      className={`w-full py-4 px-6 rounded-2xl text-lg font-semibold transition-all disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </motion.button>
  );
}
