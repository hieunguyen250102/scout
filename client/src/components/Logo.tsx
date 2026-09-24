/** The SCOUT wordmark: flat brass lettering under a small big-top tent. */

import { motion } from 'framer-motion';
import { CREAM, GOLD, INK_DEEP } from '../lib/theme';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <motion.svg
        viewBox="0 0 420 130"
        className={compact ? 'h-7 shrink-0 sm:h-9' : 'h-20 w-full max-w-xs'}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        role="img"
        aria-label="SCOUT"
      >
        {!compact && (
          <g>
            <path d="M210 4v8" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M210 2c6 1 9 3 13 4-4 2-7 4-13 5z" fill="#c55b50" />
            <path d="M210 12 184 38h52z" fill="#c55b50" />
            <path d="M210 12 201 38h8zM210 12l13 26h-6z" fill={CREAM} opacity="0.9" />
            <rect x="180" y="36" width="60" height="4" rx="2" fill={GOLD} />
          </g>
        )}

        <text
          x="210"
          y={compact ? 96 : 104}
          textAnchor="middle"
          fontFamily="'Baloo 2', sans-serif"
          fontWeight="800"
          fontSize="92"
          letterSpacing="4"
          fill={GOLD}
          stroke={INK_DEEP}
          strokeWidth="6"
          paintOrder="stroke"
        >
          SCOUT
        </text>

        {!compact && (
          <text
            x="210"
            y="126"
            textAnchor="middle"
            fontFamily="'Be Vietnam Pro', sans-serif"
            fontWeight="600"
            fontSize="14"
            letterSpacing="7"
            fill={CREAM}
            opacity="0.5"
          >
            GÁNH XIẾC
          </text>
        )}
      </motion.svg>
    </div>
  );
}
