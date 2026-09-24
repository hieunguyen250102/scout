/** Scout chips, score chips, the Scout & Show token and the start marker. */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { CREAM, GOLD, INK } from '../lib/theme';

export const ScoutChip = memo(function ScoutChip({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="52" r="42" fill="#a8791f" />
      <circle cx="50" cy="48" r="42" fill={GOLD} />
      <circle cx="50" cy="48" r="34" fill="none" stroke={INK} strokeWidth="3" opacity="0.8" />
      <text
        x="50"
        y="44"
        textAnchor="middle"
        fontFamily="'Baloo 2', sans-serif"
        fontWeight="800"
        fontSize="20"
        fill={INK}
      >
        SCOUT
      </text>
      <text
        x="50"
        y="70"
        textAnchor="middle"
        fontFamily="'Baloo 2', sans-serif"
        fontWeight="800"
        fontSize="26"
        fill={INK}
      >
        +1
      </text>
    </svg>
  );
});

export const ScoreChip = memo(function ScoreChip({ size = 34, count }: { size?: number; count?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path d="M50 6 62 22 82 18 78 38 94 50 78 62 82 82 62 78 50 94 38 78 18 82 22 62 6 50 22 38 18 18 38 22Z" fill={INK} />
      <path
        d="M50 12 61 26 78 23 75 40 88 50 75 60 78 77 61 74 50 88 39 74 22 77 25 60 12 50 25 40 22 23 39 26Z"
        fill="#3d6ea8"
      />
      <circle cx="50" cy="50" r="24" fill={INK} />
      {count !== undefined && (
        <text
          x="50"
          y="59"
          textAnchor="middle"
          fontFamily="'Baloo 2', sans-serif"
          fontWeight="800"
          fontSize="26"
          fill={CREAM}
        >
          {count}
        </text>
      )}
    </svg>
  );
});

export const ScoutShowToken = memo(function ScoutShowToken({
  size = 42,
  used = false,
}: {
  size?: number;
  used?: boolean;
}) {
  const body = used ? '#5d6b7a' : '#2e9b8f';
  const trim = used ? '#8794a2' : '#5fd0c2';
  return (
    <svg width={size} height={size * 0.78} viewBox="0 0 100 78" aria-hidden>
      {/* a little circus locomotive */}
      <rect x="8" y="26" width="52" height="30" rx="7" fill={body} stroke={INK} strokeWidth="4" />
      <rect x="60" y="12" width="30" height="44" rx="7" fill={body} stroke={INK} strokeWidth="4" />
      <rect x="66" y="20" width="18" height="14" rx="3" fill={trim} />
      <rect x="18" y="14" width="14" height="14" rx="3" fill={trim} stroke={INK} strokeWidth="3" />
      <circle cx="26" cy="62" r="11" fill={INK} />
      <circle cx="26" cy="62" r="5" fill={trim} />
      <circle cx="72" cy="62" r="11" fill={INK} />
      <circle cx="72" cy="62" r="5" fill={trim} />
      {used && <path d="M12 68 88 10" stroke="#d9534f" strokeWidth="7" strokeLinecap="round" opacity="0.85" />}
    </svg>
  );
});

export const StartMarker = memo(function StartMarker({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path d="M50 6 94 38 77 92H23L6 38Z" fill="#d9534f" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
      <path d="M50 26l6 13 14 2-10 10 3 14-13-7-13 7 3-14-10-10 14-2z" fill={GOLD} />
    </svg>
  );
});

/** A stack of Scout chips that grows with a little bounce as points come in. */
export const ChipStack = memo(function ChipStack({
  count,
  size = 26,
}: {
  count: number;
  size?: number;
}) {
  const shown = Math.min(count, 5);
  return (
    <div className="flex items-center gap-1">
      <div className="relative" style={{ width: size + (shown - 1) * 7, height: size }}>
        {Array.from({ length: shown }, (_, i) => (
          <motion.div
            key={i}
            className="absolute top-0"
            style={{ left: i * 7 }}
            initial={{ scale: 0, y: -14, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 460, damping: 18, delay: i * 0.04 }}
          >
            <ScoutChip size={size} />
          </motion.div>
        ))}
      </div>
      <span className="display text-sm font-bold text-cream/85 tabular-nums">{count}</span>
    </div>
  );
});
