'use client';

import { memo } from 'react';

/** White chevron back for What compose scene (no glow). */
export const WhatBackIcon = memo(function WhatBackIcon() {
  return (
    <svg
      className="instant-ban-what-back-icon"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M14.5 6.5 8 12l6.5 5.5"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});
