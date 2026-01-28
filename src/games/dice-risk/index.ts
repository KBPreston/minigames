import type { GameFactory } from '../../core/types';
import { DiceRiskGame } from './DiceRiskGame';

const factory: GameFactory = (container, api) => new DiceRiskGame(container, api);

export default factory;
