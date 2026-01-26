import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, signOut, onAuthStateChanged, User, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

// Lazy initialization to avoid crashing without valid config
let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _firestore: Firestore | null = null;

function isConfigValid(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!isConfigValid()) return null;
  if (!_app) {
    _app = initializeApp(firebaseConfig);
  }
  return _app;
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!_auth) {
    _auth = getAuth(app);
  }
  return _auth;
}

export function getFirestoreDb(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!_firestore) {
    _firestore = getFirestore(app);
  }
  return _firestore;
}

export async function ensureAnonymousAuth(): Promise<User | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;

  const current = auth.currentUser;
  if (current) return current;

  try {
    const user = await new Promise<User>((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsub();
        reject(new Error('Auth timeout'));
      }, 8000);

      const unsub = onAuthStateChanged(auth, async (u) => {
        if (u) {
          clearTimeout(timeout);
          unsub();
          resolve(u);
          return;
        }
        try {
          const cred = await signInAnonymously(auth);
          clearTimeout(timeout);
          unsub();
          resolve(cred.user);
        } catch (e) {
          clearTimeout(timeout);
          unsub();
          reject(e);
        }
      });
    });
    return user;
  } catch (e) {
    console.warn('Firebase auth failed:', e);
    return null;
  }
}

export async function resetFirebaseIdentity(): Promise<User | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  await signOut(auth);
  return ensureAnonymousAuth();
}
