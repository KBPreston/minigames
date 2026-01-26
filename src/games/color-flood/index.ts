import type { GameAPI, GameInstance, GameFactory } from '../../core/types';
import { ColorFloodGame } from './ColorFloodGame';

const factory: GameFactory = (container: HTMLElement, api: GameAPI): GameInstance => {
  return new ColorFloodGame(container, api);
};

export default factory;
