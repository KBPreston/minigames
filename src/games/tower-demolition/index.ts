import type { GameAPI, GameInstance, GameFactory } from '../../core/types';
import { TowerDemolitionGame } from './TowerDemolitionGame';

const factory: GameFactory = (container: HTMLElement, api: GameAPI): GameInstance => {
  return new TowerDemolitionGame(container, api);
};

export default factory;
