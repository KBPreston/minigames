import type { GameAPI, GameInstance, GameFactory } from '../../core/types';
import { BloomBurstGame } from './BloomBurstGame';

const factory: GameFactory = (container: HTMLElement, api: GameAPI): GameInstance => {
  return new BloomBurstGame(container, api);
};

export default factory;
