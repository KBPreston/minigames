import type { GameAPI, GameInstance, GameFactory } from '../../core/types';
import { BlockBlastGame } from './BlockBlastGame';

const factory: GameFactory = (container: HTMLElement, api: GameAPI): GameInstance => {
  return new BlockBlastGame(container, api);
};

export default factory;
