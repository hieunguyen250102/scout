/**
 * A player seen from across the table: their face, the back of their hand,
 * the chips they hold and the pile of cards they have captured.
 */

import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PublicPlayer } from '@shared/types';
import { AVATAR_COLORS, AVATAR_GLYPHS, CREAM, GLYPHS, GOLD, INK } from '../lib/theme';
import { ChipStack, ScoutShowToken, StartMarker } from './Chips';
import { CardPile } from './CardPile';

export const Avatar = memo(function Avatar({
  index,
  size = 44,
  ring,
}: {
  index: number;
  size?: number;
  ring?: string;
}) {
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const glyph = GLYPHS[AVATAR_GLYPHS[index % AVATAR_GLYPHS.length]];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="46" fill={color} stroke={ring ?? INK} strokeWidth={ring ? 7 : 4} />
      <g transform="translate(25 25) scale(0.5)" fill={CREAM} opacity="0.95">
        <path d={glyph} />
      </g>
    </svg>
  );
});

/** The back of someone else's hand, fanned the way they would hold it. */
const OpponentFan = memo(function OpponentFan({ count, max = 9 }: { count: number; max?: number }) {
  const shown = Math.min(count, max);
  const mid = (shown - 1) / 2;
  return (
    <div className="relative h-8" style={{ width: 16 + shown * 5 }} aria-hidden>
      {Array.from({ length: shown }, (_, i) => (
        <motion.span
          key={i}
          className="absolute bottom-0 origin-bottom overflow-hidden rounded-[2px] ring-1 ring-ink"
          style={{ width: 14, height: 21, left: i * 5 }}
          initial={{ opacity: 0, y: -10, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, scale: 1, rotate: (i - mid) * 4 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ type: 'spring', stiffness: 400, damping: 26, delay: i * 0.02 }}
        >
          <img src="/img/card-back.webp" alt="" className="h-full w-full object-cover" />
        </motion.span>
      ))}
    </div>
  );
});

interface Props {
  player: PublicPlayer;
  isTurn: boolean;
  isStart: boolean;
  isYou?: boolean;
  /** the 2-player variant has no Scout & Show token at all */
  hideScoutShow?: boolean;
  /** tighter layout, for tables with three or more opponents */
  dense?: boolean;
  /** their latest chat line, shown briefly as a speech bubble */
  bubble?: string | null;
}

export const PlayerSeat = memo(function PlayerSeat({
  player,
  isTurn,
  isStart,
  isYou,
  hideScoutShow,
  dense,
  bubble,
}: Props) {
  return (
    <motion.div
      layout
      className={`panel relative flex items-center rounded-2xl transition-colors ${
        dense ? 'gap-2 px-2 py-1.5' : 'gap-2.5 px-2.5 py-2'
      } ${isTurn ? '!border-gold/70 !bg-ink-3' : ''}`}
    >
      {/* whose turn it is: a quiet brass bar along the top edge */}
      {isTurn && (
        <motion.span
          layoutId="turn-bar"
          className="absolute inset-x-4 -top-px h-[3px] rounded-b-full bg-gold"
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      )}

      <AnimatePresence>
        {bubble && (
          <motion.div
            key={bubble}
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-3 top-full z-30 mt-1.5 max-w-[16rem] rounded-xl rounded-tl-sm bg-cream px-2.5 py-1.5 text-xs font-medium leading-snug text-ink shadow-lg"
          >
            {bubble}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative shrink-0">
        <Avatar index={player.avatar} size={dense ? 32 : 40} ring={isTurn ? GOLD : undefined} />
        {isStart && (
          <span className="absolute -left-2 -top-2">
            <StartMarker size={dense ? 16 : 19} />
          </span>
        )}
        {!player.connected && !player.isBot && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-crimson px-1 text-[9px] font-bold text-cream">
            off
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="display truncate text-sm font-bold text-cream">{player.name}</span>
          {isYou && <span className="rounded bg-gold/25 px-1 text-[10px] font-bold text-gold">BẠN</span>}
          {player.isBot && <span className="rounded bg-teal/25 px-1 text-[10px] font-bold text-teal">BOT</span>}
        </div>

        <div className="mt-0.5 flex items-end gap-2.5 text-[11px] text-cream/70">
          <span className="flex items-end gap-1">
            <OpponentFan count={player.handCount} max={dense ? 4 : 9} />
            <span className="display font-bold tabular-nums text-cream/90">{player.handCount}</span>
          </span>
          {player.scoutChips > 0 && <ChipStack count={player.scoutChips} size={dense ? 14 : 17} />}
          {player.scoreCards > 0 && (
            <span className="pb-0.5">
              <CardPile count={player.scoreCards} size={dense ? 12 : 15} label="Lá đã ăn" />
            </span>
          )}
          {!hideScoutShow && !player.scoutShowAvailable && (
            <span className="pb-1 opacity-50">
              <ScoutShowToken size={dense ? 16 : 20} used />
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div
          className={`display font-extrabold leading-none text-gold tabular-nums ${
            dense ? 'text-base' : 'text-lg'
          }`}
        >
          {player.totalScore}
        </div>
        {!dense && <div className="text-[9px] uppercase tracking-wider text-cream/45">điểm</div>}
      </div>
    </motion.div>
  );
});
