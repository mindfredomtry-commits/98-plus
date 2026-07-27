'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { logWhatHit } from './whatScreenTouchDiag';

export const WHAT_DURATION_MIN = 3;
export const WHAT_DURATION_MAX = 60;

export function clampWhatDurationMinutes(value: number): number {
  return Math.min(
    WHAT_DURATION_MAX,
    Math.max(WHAT_DURATION_MIN, Math.round(value)),
  );
}

function clampRaw(value: number): number {
  return Math.min(WHAT_DURATION_MAX, Math.max(WHAT_DURATION_MIN, value));
}

type Props = {
  value: number;
  onChange: (minutes: number) => void;
};

export const WhatDurationSlider = memo(function WhatDurationSlider({
  value,
  onChange,
}: Props) {
  const draggingRef = useRef(false);
  const [rawValue, setRawValue] = useState(() => clampRaw(value));

  useEffect(() => {
    if (!draggingRef.current) {
      setRawValue(clampRaw(value));
    }
  }, [value]);

  const displayMinutes = clampWhatDurationMinutes(rawValue);
  const fillPercent = useMemo(() => {
    const span = WHAT_DURATION_MAX - WHAT_DURATION_MIN;
    return ((rawValue - WHAT_DURATION_MIN) / span) * 100;
  }, [rawValue]);

  const trackStyle = useMemo(
    () =>
      ({
        '--what-duration-fill-pct': `${fillPercent}%`,
      }) as CSSProperties,
    [fillPercent],
  );

  const endDrag = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = clampRaw(parseFloat(e.target.value));
      draggingRef.current = true;
      setRawValue(next);
      onChange(clampWhatDurationMinutes(next));
    },
    [onChange],
  );

  return (
    <div
      className="instant-ban-what-duration-slider"
      data-duration-slider=""
      data-gesture-exclude=""
      data-no-horizontal-pager=""
    >
      <div
        className="instant-ban-what-duration-slider__value-pill"
        aria-live="polite"
      >
        {displayMinutes}м
      </div>
      <div
        className="instant-ban-what-duration-slider__track-wrap"
        style={trackStyle}
      >
        <input
          type="range"
          className="instant-ban-what-duration-slider__input"
          min={WHAT_DURATION_MIN}
          max={WHAT_DURATION_MAX}
          step={0.01}
          value={rawValue}
          onInput={handleInput}
          onChange={handleInput}
          onPointerDown={() => logWhatHit('slider', { source: 'pointerdown' })}
          onTouchStart={() => logWhatHit('slider', { source: 'touchstart' })}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onBlur={endDrag}
          aria-label="Длительность запрета в минутах"
          aria-valuemin={WHAT_DURATION_MIN}
          aria-valuemax={WHAT_DURATION_MAX}
          aria-valuenow={displayMinutes}
          aria-valuetext={`${displayMinutes} минут`}
        />
      </div>
    </div>
  );
});
