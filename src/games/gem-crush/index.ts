import type { GameAPI, GameInstance, GameFactory } from '../../core/types';
import { GemCrushGame } from './GemCrushGame';

const factory: GameFactory = (container: HTMLElement, api: GameAPI): GameInstance => {
  return new GemCrushGame(container, api);
};

export default factory;
