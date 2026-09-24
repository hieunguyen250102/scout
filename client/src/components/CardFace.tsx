/**
 * The printed face of a SCOUT card, drawn as SVG so it stays sharp at any
 * size and can be recoloured per value.
 *
 * A card carries two numbers. `active` is the one facing its owner and is
 * what counts; `passive` is what you would get by flipping the card when you
 * Scout it. The layout is built for a fanned hand, where only the left strip
 * of most cards is visible: both numbers sit in that strip, upright, so the
 * whole hand reads at a glance. The emblems on the right are decoration.
 */

import { memo } from 'react';
import { CREAM, GLYPHS, PAPER, valueColor } from '../lib/theme';

interface Props {
  active: number;
  passive: number;
  /** kept for API compatibility with cards lying on the table */
  muted?: boolean;
}

function CardFaceImpl({ active, passive }: Props) {
  const c = valueColor(active);
  const p = valueColor(passive);
  const uid = `cf${active}x${passive}`;

  return (
    <svg viewBox="0 0 200 300" className="block h-full w-full" role="img" aria-label={`Lá ${active} / ${passive}`}>
      <defs>
        <clipPath id={`${uid}-clip`}>
          <rect x="0" y="0" width="200" height="300" rx="18" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${uid}-clip)`}>
        <rect width="200" height="300" fill={PAPER} />

        {/* each half is tinted in its own value's colour */}
        <rect width="200" height="150" fill={c.light} />
        <rect y="150" width="200" height="150" fill={p.light} opacity="0.75" />
        <line x1="0" y1="150" x2="200" y2="150" stroke="#000" strokeOpacity="0.08" strokeWidth="2" />

        {/* ---- active value: large, top-left, always visible in the fan ---- */}
        <text
          x={active === 10 ? 16 : 22}
          y="100"
          fontFamily="'Baloo 2', sans-serif"
          fontWeight="800"
          fontSize={active === 10 ? 84 : 100}
          letterSpacing={active === 10 ? -5 : 0}
          fill={c.deep}
        >
          {active}
        </text>
        {/* underline: tells 6 from 9 and anchors the number */}
        <rect x="24" y="112" width="46" height="8" rx="4" fill={c.base} />

        {/* emblem for the active value */}
        <circle cx="152" cy="62" r="30" fill={c.base} />
        <g transform="translate(152 62) scale(0.46) translate(-50 -50)" fill={CREAM}>
          <path d={GLYPHS[active] ?? GLYPHS[1]} />
        </g>

        {/* ---- passive value: the flip side, smaller and quieter ---- */}
        <rect x="18" y="206" width="64" height="72" rx="14" fill={PAPER} stroke={p.base} strokeWidth="3.5" />
        <text
          x="50"
          y="258"
          textAnchor="middle"
          fontFamily="'Baloo 2', sans-serif"
          fontWeight="800"
          fontSize={passive === 10 ? 40 : 50}
          letterSpacing={passive === 10 ? -2 : 0}
          fill={p.deep}
        >
          {passive}
        </text>
        {/* a small turn arrow: "you get this one if you flip it" */}
        <path d="M36 197a14 14 0 0 1 28 0" fill="none" stroke={p.base} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M64 198l-7-5M64 198l5-7" stroke={p.base} strokeWidth="3.5" strokeLinecap="round" />

        <circle cx="152" cy="240" r="22" fill={p.base} opacity="0.75" />
        <g transform="translate(152 240) scale(0.33) translate(-50 -50)" fill={CREAM}>
          <path d={GLYPHS[passive] ?? GLYPHS[1]} />
        </g>
      </g>

      <rect
        x="1.5"
        y="1.5"
        width="197"
        height="297"
        rx="17"
        fill="none"
        stroke="#000"
        strokeOpacity="0.22"
        strokeWidth="3"
      />
    </svg>
  );
}

export const CardFace = memo(CardFaceImpl);
