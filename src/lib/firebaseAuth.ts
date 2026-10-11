import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '@/firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Minimum required Gmail scope: gmail.send
provider.addScope('https://www.googleapis.com/auth/gmail.send');
provider.setCustomParameters({
  prompt: 'consent select_account',
});

let cachedAccessToken: string | null = null;
let cachedUser: User | null = null;

export async function connectGmailWithOAuth(): Promise<{
  email: string;
  accessToken: string;
  displayName: string | null;
}> {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    if (!accessToken) {
      throw new Error(
        'Google authentication was successful, but no Gmail OAuth access token was returned. Ensure third-party cookies and popups are allowed.'
      );
    }

    cachedAccessToken = accessToken;
    cachedUser = result.user;
    const email = result.user.email || '';

    // Send access token directly to server-side secure in-memory store
    const res = await fetch('/api/gmail/connect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        accessToken,
        email,
        displayName: result.user.displayName,
      }),
    });

    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || 'Server failed to initialize Gmail session.');
    }

    return {
      email: body.email || email,
      accessToken,
      displayName: result.user.displayName,
    };
  } catch (error: any) {
    console.error('Gmail OAuth connection failed:', error);
    throw error;
  }
}

export async function disconnectGmailSession(): Promise<void> {
  cachedAccessToken = null;
  cachedUser = null;
  try {
    await signOut(auth);
  } catch {}
  await fetch('/api/gmail/disconnect', { method: 'POST' });
}

export function getCachedGmailUser(): User | null {
  return cachedUser;
}
