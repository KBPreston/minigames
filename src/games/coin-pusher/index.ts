import type { GameFactory } from '../../core/types';
import { CoinPusherGame } from './CoinPusherGame';

const factory: GameFactory = (container, api) => new CoinPusherGame(container, api);

export default factory;
