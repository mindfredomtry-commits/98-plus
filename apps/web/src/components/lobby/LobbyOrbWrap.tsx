'use client';

import { forwardRef, type CSSProperties, type ReactNode } from 'react';

type Props = {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/** Lobby orb mount — always full size, no boot intro animation. */
export const LobbyOrbWrap = forwardRef<HTMLDivElement, Props>(
  function LobbyOrbWrap({ className = '', style, children }, ref) {
    return (
      <div
        ref={ref}
        className={`lobby-orb-ready ${className}`.trim()}
        style={style}
        data-orb-root
        data-lobby-orb-ready
      >
        {children}
      </div>
    );
  },
);
