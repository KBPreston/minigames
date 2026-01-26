import type { GameAPI, GameInstance, GameFactory } from '../../core/types';
import { SnapMergeGame } from './SnapMergeGame';

const factory: GameFactory = (container: HTMLElement, api: GameAPI): GameInstance => {
  return new SnapMergeGame(container, api);
};

export default factory;
