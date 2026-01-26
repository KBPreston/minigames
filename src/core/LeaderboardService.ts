import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { getFirestoreDb, ensureAnonymousAuth, getFirebaseAuth } from './firebase';

export interface LeaderboardEntry {
  uid: string;
  gameId: string;
  playerName: string;
  score: number;
  updatedAt?: unknown;
}

class LeaderboardServiceImpl {
  async submitBest(gameId: string, playerName: string, score: number): Promise<void> {
    const firestore = getFirestoreDb();
    const user = await ensureAnonymousAuth();
    if (!firestore || !user) return;

    const ref = doc(firestore, 'leaderboards', gameId, 'bestByUser', user.uid);

    const existing = await getDoc(ref);
    if (existing.exists()) {
      const data = existing.data() as LeaderboardEntry;
      if (typeof data.score === 'number' && data.score >= score) {
        return;
      }
    }

    const payload: LeaderboardEntry = {
      uid: user.uid,
      gameId,
      playerName,
      score,
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, payload, { merge: true });
  }

  async fetchTop(gameId: string, topN = 50): Promise<LeaderboardEntry[]> {
    const firestore = getFirestoreDb();
    await ensureAnonymousAuth();
    if (!firestore) return [];

    const col = collection(firestore, 'leaderboards', gameId, 'bestByUser');
    const q = query(col, orderBy('score', 'desc'), limit(topN));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as LeaderboardEntry);
  }

  async fetchTopWithRank(
    gameId: string,
    topN = 50
  ): Promise<{ entries: LeaderboardEntry[]; rankInTop: number | null }> {
    const auth = getFirebaseAuth();
    const user = auth?.currentUser || await ensureAnonymousAuth();
    const entries = await this.fetchTop(gameId, topN);
    if (!user) return { entries, rankInTop: null };
    const idx = entries.findIndex((e) => e.uid === user.uid);
    return { entries, rankInTop: idx >= 0 ? idx + 1 : null };
  }

  async fetchTopScore(gameId: string): Promise<{ playerName: string; score: number } | null> {
    const entries = await this.fetchTop(gameId, 1);
    if (entries.length === 0) return null;
    return { playerName: entries[0].playerName, score: entries[0].score };
  }
}

export const LeaderboardService = new LeaderboardServiceImpl();
