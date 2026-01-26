import type { GameDefinition, GameMetadata } from './types';

export const GAMES: GameDefinition[] = [
  {
    id: 'wrecking-ball',
    name: 'Wrecking Ball',
    icon: '🔴',
    factory: () => import('../games/wrecking-ball'),
  },
  {
    id: 'bloom-burst',
    name: 'Bloom Burst',
    icon: '🌸',
    factory: () => import('../games/bloom-burst'),
  },
  {
    id: 'block-blast',
    name: 'Block Blast',
    icon: '🧱',
    factory: () => import('../games/block-blast'),
  },
  {
    id: 'snap-merge',
    name: 'Snap Merge',
    icon: '🧲',
    factory: () => import('../games/snap-merge'),
  },
  {
    id: 'color-flood',
    name: 'Color Flood',
    icon: '🎨',
    factory: () => import('../games/color-flood'),
  },
];

export function getGameById(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id);
}

export function getGameMetadata(): GameMetadata[] {
  return GAMES.map(({ id, name, icon, disabled }) => ({ id, name, icon, disabled }));
}
