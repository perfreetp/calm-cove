import type { Boat, Race, SquadId } from './types';

export interface RaceConflict {
  kind: 'boat-double-booked' | 'lane-clash' | 'time-clash' | 'squad-mismatch' | 'incomplete';
  raceId: string;
  otherRaceId?: string;
  lane?: number;
  boatId?: string;
  message: string;
  severity: 'hard' | 'soft';
}

export const RACE_LANES = [1, 2, 3, 4, 5, 6];

export function squadOf(boats: Boat[], boatId: string | null): SquadId | null {
  if (!boatId) return null;
  return boats.find((b) => b.id === boatId)?.squad ?? null;
}

/** A race's discipline is defined by the boats already placed, then by its name. */
export function raceSquad(race: Race, boats: Boat[]): SquadId {
  const counts = new Map<string, number>();
  for (const l of race.lanes) {
    const sq = squadOf(boats, l.boatId);
    if (sq) counts.set(sq, (counts.get(sq) ?? 0) + 1);
  }
  if (counts.size) return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] as SquadId;
  const n = race.name;
  if (n.includes('女子单人')) return 'W1x';
  if (n.includes('男子单人')) return 'M1x';
  if (n.includes('轻')) return 'LM2x';
  if (n.includes('女子')) return 'W2x';
  if (n.includes('男子')) return 'M2x';
  return 'M2x';
}

export function raceSquadName(race: Race, boats: Boat[], squadsName: (id: string) => string): string {
  return squadsName(raceSquad(race, boats));
}

/**
 * Conflict scan. A crew may only appear once across all heats of the same
 * discipline on a race day, two races cannot share a start minute, and a lane
 * cannot host two crews at once.
 */
export function findConflicts(races: Race[], boats: Boat[]): RaceConflict[] {
  const out: RaceConflict[] = [];
  const byDay = new Map<string, Race[]>();
  for (const r of races) {
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day)!.push(r);
  }

  for (const [, list] of byDay) {
    // within a single race
    for (const r of list) {
      const ids = r.lanes.map((l) => l.boatId).filter(Boolean) as string[];
      const dupes = ids.filter((b, i) => ids.indexOf(b) !== i);
      for (const d of new Set(dupes)) {
        out.push({
          kind: 'lane-clash',
          raceId: r.id,
          boatId: d,
          message: `${boats.find((b) => b.id === d)?.code ?? d} 在同一组被分到两条赛道`,
          severity: 'hard'
        });
      }
      const filled = ids.length;
      if (filled === 0) {
        out.push({
          kind: 'incomplete',
          raceId: r.id,
          message: '尚未分配任何赛道',
          severity: 'soft'
        });
      } else if (filled < 2) {
        out.push({
          kind: 'incomplete',
          raceId: r.id,
          message: `仅 ${filled} 艇入列，至少 2 艇成组`,
          severity: 'soft'
        });
      }
      const squad = raceSquad(r, boats);
      for (const l of r.lanes) {
        if (!l.boatId) continue;
        const sq = squadOf(boats, l.boatId);
        if (sq && sq !== squad) {
          out.push({
            kind: 'squad-mismatch',
            raceId: r.id,
            lane: l.lane,
            boatId: l.boatId,
            message: `${boats.find((b) => b.id === l.boatId)?.code} 组别与本场不符`,
            severity: 'hard'
          });
        }
      }
    }

    // across races on the same day
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.time === b.time) {
          // two races starting on the same minute physically cannot happen on one course
          out.push({
            kind: 'time-clash',
            raceId: b.id,
            otherRaceId: a.id,
            message: `与「${a.name}」同为 ${a.time} 开赛，同一水域无法同时起航`,
            severity: 'hard'
          });
        }
        // a crew entered twice in the same phase (heat into final is legitimate progression)
        if (a.phase !== b.phase) continue;
        const aBoats = new Map(a.lanes.filter((l) => l.boatId).map((l) => [l.boatId!, l.lane]));
        for (const l of b.lanes) {
          if (!l.boatId || !aBoats.has(l.boatId)) continue;
          out.push({
            kind: 'boat-double-booked',
            raceId: b.id,
            otherRaceId: a.id,
            boatId: l.boatId,
            lane: l.lane,
            message: `${boats.find((x) => x.id === l.boatId)?.code} 已列入「${a.name}」${aBoats.get(l.boatId)} 道`,
            severity: 'hard'
          });
        }
      }
    }
  }
  return out;
}

export function conflictsFor(raceId: string, all: RaceConflict[]) {
  return all.filter((c) => c.raceId === raceId);
}
