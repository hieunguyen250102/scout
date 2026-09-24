/**
 * Rules smoke test: unit checks on the engine plus full bot-vs-bot games
 * at every player count, asserting the invariants the rulebook guarantees.
 */

import assert from 'node:assert';
import { beats, classify, deckForPlayers, handSizeFor, checkShow, legalShows, rotateHand, value } from '../../shared/engine';
import { Room } from '../src/room';
import { chooseAction } from '../src/bot';
import type { Card } from '../../shared/types';

let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  assert.ok(cond, msg);
}

/* ---------------------------------------------------------------- deck */

ok(deckForPlayers(5).length === 45, '5p uses all 45 cards');
ok(deckForPlayers(4).length === 44, '4p removes the 9/10 card');
ok(deckForPlayers(2).length === 44, '2p removes the 9/10 card');
ok(deckForPlayers(3).length === 36, '3p removes every card showing a 10');
ok(!deckForPlayers(3).some((c) => c.top === 10 || c.bottom === 10), '3p deck has no 10s');
for (const n of [2, 3, 4, 5]) {
  const needed = handSizeFor(n) * n;
  const have = deckForPlayers(n).length;
  ok(n === 2 ? have === needed * 2 : have === needed, `deck divides evenly for ${n}p`);
}

/* ------------------------------------------------------------ classify */

ok(classify([4]) === 'single', 'one card is a single');
ok(classify([3, 3, 3]) === 'match', 'equal numbers are a match');
ok(classify([3, 4, 5]) === 'run', 'ascending is a run');
ok(classify([5, 4, 3]) === 'run', 'descending is a run');
ok(classify([4, 3, 5]) === null, 'out-of-order numbers are not a set');
ok(classify([3, 5]) === null, 'gaps are not a set');

/* --------------------------------------------------------------- beats */

const S = (values: number[]) => ({ values, type: classify(values)! });
ok(beats(S([2, 3, 4]), S([8, 8])), 'more cards beats fewer');
ok(!beats(S([1]), S([8, 8])), 'fewer cards never beats more');
ok(beats(S([2, 2]), S([4, 5])), 'match beats a run of the same size');
ok(!beats(S([4, 5]), S([2, 2])), 'a run never beats a match of the same size');
ok(beats(S([5, 6]), S([4, 5])), 'same size and type → higher lowest card wins');
ok(!beats(S([4, 5]), S([4, 5])), 'ties lose');
ok(!beats(S([3, 4]), S([4, 5])), 'lower lowest card loses');
ok(beats(S([9]), S([8])), 'singles compare by number');
ok(beats(S([3]), null), 'anything beats an empty table');

/* ----------------------------------------------------- hand + rotation */

const card = (top: number, bottom: number, flipped = false): Card => ({ id: `${top}-${bottom}`, top, bottom, flipped });

const hand: Card[] = [card(1, 9), card(2, 8), card(3, 7)];
ok(hand.map(value).join() === '1,2,3', 'unflipped hand shows the top numbers');
const rotated = rotateHand(hand);
ok(rotated.map(value).join() === '7,8,9', 'rotating the fan flips every card and reverses the order');
ok(rotateHand(rotated).map(value).join() === '1,2,3', 'rotating twice is a no-op');

ok(!checkShow(hand, [0, 2], null).ok, 'non-adjacent cards cannot be shown');
ok(checkShow(hand, [0, 1, 2], null).ok, 'adjacent run is showable');
ok(!checkShow(hand, [0, 1], S([5, 5])).ok, 'a run cannot beat a match of the same size');

const shows = legalShows(hand, null);
ok(shows.length === 6, 'a 1-2-3 hand offers 6 legal sets on an empty table');

/* -------------------------------------------------- full bot playouts */

function playGame(playerCount: number, seed: number): void {
  const room = new Room(`T${seed}`);
  for (let i = 0; i < playerCount; i++) {
    room.addPlayer({ id: `bot${i}`, name: `Bot${i}`, avatar: i, isBot: true });
  }
  const err = room.start();
  ok(err === null, `game with ${playerCount} players starts`);

  let guard = 0;
  while (room.phase !== 'gameEnd') {
    if (++guard > 20000) throw new Error(`game did not terminate (${playerCount}p, seed ${seed})`);

    if (room.phase === 'flip') {
      for (const p of room.players) if (!p.flipDecided) room.decideFlip(p.id, false);
      continue;
    }
    if (room.phase === 'roundEnd') {
      const total = room.players.reduce((s, p) => s + p.hand.length, 0);
      const onTable = room.activeSet?.cards.length ?? 0;
      const captured = room.players.reduce((s, p) => s + p.scoreCards, 0);
      const expected = handSizeFor(playerCount) * playerCount;
      ok(total + onTable + captured === expected, `no cards lost or duplicated (${playerCount}p)`);
      room.nextRound();
      continue;
    }

    const p = room.current;
    const action = chooseAction(room, p.id);
    ok(action !== null, `${p.name} always has a legal move`);
    const moveErr = action!.type === 'show' ? room.show(p.id, action!) : room.scout(p.id, action!);
    ok(moveErr === null, `bot move is legal: ${moveErr}`);

    // Cards are conserved at every single step: hands + table + captured piles.
    const live =
      room.players.reduce((s, q) => s + q.hand.length + q.scoreCards, 0) +
      (room.activeSet?.cards.length ?? 0);
    ok(live === handSizeFor(playerCount) * playerCount, `cards conserved mid-turn (${playerCount}p)`);
  }

  ok(room.round === playerCount, `${playerCount}p game runs ${playerCount} rounds`);
  ok((room.winnerIds?.length ?? 0) >= 1, 'a winner is declared');
  const top = Math.max(...room.players.map((p) => p.totalScore));
  ok(
    room.winnerIds!.every((id) => room.find(id)!.totalScore === top),
    'winners hold the top score',
  );
}

for (const n of [2, 3, 4, 5]) {
  for (let seed = 0; seed < 25; seed++) playGame(n, seed);
}

/* ------------------------------------------------- scoring corner case */

{
  const room = new Room('SCORE');
  for (let i = 0; i < 3; i++) room.addPlayer({ id: `p${i}`, name: `P${i}`, avatar: i, isBot: true });
  room.start();
  for (const p of room.players) if (!p.flipDecided) room.decideFlip(p.id, false);

  // Force condition "ii": everyone after a show only scouts.
  room.show('p0', { type: 'show', indices: [0] });
  room.scout('p1', { type: 'scout', from: 'left', toIndex: 0, flip: false });
  ok(room.phase === 'playing', 'set emptied by the scout keeps the round alive');
}

console.log(`\n  ✓ ${checks} rule checks passed (100 full bot games across 2–5 players)\n`);
