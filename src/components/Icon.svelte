<script lang="ts">
  interface Props {
    name: string;
    size?: number;
    stroke?: number;
  }
  let { name, size = 16, stroke = 1.5 }: Props = $props();

  const paths: Record<string, string> = {
    overview: 'M2 12h4l2.5-7 3 11L14 9h6',
    races: 'M3 5h18M3 12h12M3 19h18',
    replay: 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4M12 8v4l3 2',
    stats: 'M4 20V10M10 20V4M16 20v-7M22 20V7',
    sessions: 'M4 5h16v14H4zM4 9h16M8 5v4',
    review: 'M4 4h11l5 5v11H4zM15 4v5h5M8 14l2.5 2.5L16 11',
    laneplan: 'M3 6h18M3 12h18M3 18h18M7 4v16M17 4v16',
    layers: 'M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5',
    anchor: 'M12 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 8v13M5 16a7 7 0 0 0 14 0M3 16h4M17 16h4',
    wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
    audit: 'M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h6',
    chevron: 'M9 6l6 6-6 6',
    close: 'M6 6l12 12M18 6L6 18',
    check: 'M4 12l5 5L20 6',
    play: 'M7 4l13 8-13 8z',
    pause: 'M8 5v14M16 5v14',
    plus: 'M12 5v14M5 12h14',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    flag: 'M5 21V4M5 4h11l-1.5 4L16 12H5',
    upload: 'M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
    warn: 'M12 3l9 17H3zM12 9v5M12 17v.01',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    wave: 'M2 14c3 0 4-2 7-2s4 2 7 2 4-2 6-2M2 19c3 0 4-2 7-2s4 2 7 2 4-2 6-2M2 9c3 0 4-2 7-2s4 2 7 2 4-2 6-2',
    users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M17 3.5a4 4 0 0 1 0 7.7M22 21v-2a4 4 0 0 0-3-3.9',
    filter: 'M3 5h18l-7 8v6l-4 2v-8z',
    refresh: 'M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6',
    arrowUp: 'M12 19V5M6 11l6-6 6 6',
    arrowDown: 'M12 5v14M6 13l6 6 6-6',
    split: 'M4 20V4M4 12h8l5-5M4 16h8l5 5',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.3.9a7 7 0 0 0-1.7-1L14.5 3h-4l-.4 2.9a7 7 0 0 0-1.7 1L6 6l-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6L6 18l2.4-.9a7 7 0 0 0 1.7 1l.4 2.9h4l.4-2.9a7 7 0 0 0 1.7-1l2.3.9 2-3.4-2-1.6a7 7 0 0 0 .1-1z'
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={paths[name] ?? paths.target} />
</svg>
