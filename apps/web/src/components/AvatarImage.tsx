'use client';

import { memo, useEffect, useState } from 'react';
import { normalizeAvatarUrl } from '@/lib/avatar-url';

const LOAD_TIMEOUT_MS = 12_000;

type Props = {
  src: string | null | undefined;
  letter: string;
  /** e.g. w-[72px] h-[72px] */
  sizeClass: string;
  textClass?: string;
  ringClassName?: string;
  priority?: boolean;
  /** Soft neon ring when friend is online */
  onlineGlow?: boolean;
  className?: string;
};

function AvatarImageInner({
  src,
  letter,
  sizeClass,
  textClass = 'text-2xl',
  ringClassName = 'ring-white/10',
  priority = false,
  onlineGlow = false,
  className = '',
}: Props) {
  const normalized = normalizeAvatarUrl(src);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!normalized);

  useEffect(() => {
    if (!normalized) {
      setLoaded(false);
      setFailed(true);
      return;
    }
    setLoaded(false);
    setFailed(false);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setFailed(true);
    }, LOAD_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalized]);

  const showPhoto = Boolean(normalized) && loaded && !failed;

  return (
    <div
      className={`avatar-image relative shrink-0 ${sizeClass} ${onlineGlow ? 'avatar-image--online' : ''} ${className}`}
      aria-hidden
    >
      <div
        className={`avatar-image__fallback absolute inset-0 rounded-full flex items-center justify-center font-bold bg-gradient-to-br from-white/14 to-white/6 ring-2 ${ringClassName} text-muted ${textClass}`}
      >
        {letter}
      </div>
      {normalized && !failed ? (
        <img
          src={normalized}
          alt=""
          decoding="async"
          loading={priority ? 'eager' : 'lazy'}
          referrerPolicy="no-referrer"
          className={`avatar-image__photo absolute inset-0 w-full h-full rounded-full object-cover ring-2 ring-white/15 bg-transparent transition-opacity duration-200 ease-out ${
            showPhoto ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => {
            setLoaded(true);
            setFailed(false);
          }}
          onError={() => {
            setLoaded(false);
            setFailed(true);
          }}
        />
      ) : null}
    </div>
  );
}

export const AvatarImage = memo(AvatarImageInner);
