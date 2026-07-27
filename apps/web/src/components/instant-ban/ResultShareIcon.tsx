'use client';

import { memo } from 'react';

/** Share / export arrow for result card corner (↗). */
export const ResultShareIcon = memo(function ResultShareIcon() {
  return (
    <svg
      className="result-card-head__share-icon"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M7 17 17 7M17 7h-6M17 7v6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});
