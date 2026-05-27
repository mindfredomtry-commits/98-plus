'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { normalizeAvatarUrl } from '@/lib/avatar-url';
import { isAvatarUrlPreloaded, preloadedAvatarUrls } from '@/lib/avatar-preload';
import { logAvatarStartup } from '@/lib/avatar-startup-diag';

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
  /** Set after startup preload — avoids letter→photo flicker. */
  readyState?: 'photo' | 'fallback';
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
  readyState,
}: Props) {
  const normalized = normalizeAvatarUrl(src);
  const prevSrcRef = useRef<string | null>(null);
  const preloadedPhoto = readyState === 'photo';
  const preloadedFallback = readyState === 'fallback';

  const [loaded, setLoaded] = useState(() => {
    if (preloadedFallback || !normalized) return false;
    if (preloadedPhoto) return true;
    return isAvatarUrlPreloaded(normalized);
  });
  const [failed, setFailed] = useState(
    () => preloadedFallback || !normalized,
  );

  useEffect(() => {
    if (preloadedFallback) {
      setLoaded(false);
      setFailed(true);
      return;
    }
    if (preloadedPhoto && normalized) {
      preloadedAvatarUrls.add(normalized);
      setLoaded(true);
      setFailed(false);
      prevSrcRef.current = normalized;
      return;
    }

    if (!normalized) {
      prevSrcRef.current = null;
      setLoaded(false);
      setFailed(true);
      return;
    }

    if (prevSrcRef.current === normalized) {
      return;
    }
    prevSrcRef.current = normalized;

    if (preloadedAvatarUrls.has(normalized)) {
      setLoaded(true);
      setFailed(false);
      return;
    }

    setLoaded(false);
    setFailed(false);
  }, [normalized, preloadedPhoto, preloadedFallback]);

  const showPhoto = Boolean(normalized) && loaded && !failed;
  const instantPhoto =
    preloadedPhoto ||
    (normalized != null && isAvatarUrlPreloaded(normalized)) ||
    (showPhoto && isAvatarUrlPreloaded(normalized));
  const renderLoggedRef = useRef(false);

  useEffect(() => {
    if (!showPhoto || renderLoggedRef.current) return;
    renderLoggedRef.current = true;
    logAvatarStartup('[avatar-render]', {
      priority,
      instant: instantPhoto,
      preloaded: normalized ? isAvatarUrlPreloaded(normalized) : false,
    });
  }, [showPhoto, priority, instantPhoto, normalized]);

  const imgDecoding = instantPhoto || priority ? 'sync' : 'async';

  return (
    <div
      className={`avatar-image relative shrink-0 ${sizeClass} ${onlineGlow ? 'avatar-image--online' : ''} ${className}`}
      aria-hidden
    >
      <div
        className={`avatar-image__fallback absolute inset-0 rounded-full flex items-center justify-center font-bold bg-gradient-to-br from-white/14 to-white/6 ring-2 ${ringClassName} text-muted ${textClass} ${
          showPhoto ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {letter}
      </div>
      {normalized && !failed ? (
        <img
          key={normalized}
          src={normalized}
          alt=""
          decoding={imgDecoding}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          referrerPolicy="no-referrer"
          className={`avatar-image__photo absolute inset-0 w-full h-full rounded-full object-cover ring-2 ring-white/15 bg-transparent ${
            instantPhoto ? 'opacity-100' : `transition-opacity duration-200 ease-out ${showPhoto ? 'opacity-100' : 'opacity-0'}`
          }`}
          onLoad={() => {
            if (normalized) preloadedAvatarUrls.add(normalized);
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
