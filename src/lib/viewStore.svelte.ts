import type { LayerId, LayerState } from './types';
import { DEFAULT_LAYERS } from './ui';

class ViewStore {
  role = $state<'viewer' | 'coach'>('viewer');
  page = $state('overview');
  layers = $state<LayerState>({ ...DEFAULT_LAYERS });
  selected = $state<string[]>([]);
  hovered = $state<string | null>(null);
  /** session highlighted on the map */
  focusSessionId = $state<string | null>(null);
  /** race screen state */
  activeRaceId = $state<string | null>(null);
  auditOpen = $state(false);
  playback = $state<{ runId: string; t: number; playing: boolean; speed: number } | null>(null);

  toggleLayer(id: LayerId, on?: boolean) {
    this.layers = { ...this.layers, [id]: on ?? !this.layers[id] };
  }

  soloLayer(id: LayerId) {
    const next: LayerState = { ...this.layers };
    for (const k of Object.keys(next) as LayerId[]) next[k] = k === id;
    next.tracks = id === 'tracks' ? true : next.tracks;
    this.layers = next;
  }

  select(id: string | null, additive = false) {
    if (!id) {
      this.selected = [];
      return;
    }
    if (additive) {
      this.selected = this.selected.includes(id)
        ? this.selected.filter((x) => x !== id)
        : [...this.selected, id];
    } else {
      this.selected = [id];
    }
  }

  isSelected(id: string) {
    return this.selected.includes(id);
  }

  clearSelection() {
    this.selected = [];
  }

  startPlayback(runId: string) {
    this.playback = { runId, t: 0, playing: true, speed: 1 };
  }
}
export const view = new ViewStore();
