import type { GameAPI, GameInstance, GameFactory } from '../../core/types';
import { WreckingBallGame } from './WreckingBallGame';

const factory: GameFactory = (container: HTMLElement, api: GameAPI): GameInstance => {
  return new WreckingBallGame(container, api);
};

export default factory;
