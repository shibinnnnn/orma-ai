import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

let messagingInstance: any = null;

export const getMessagingInstance = async () => {
  if (messagingInstance) return messagingInstance;
  if (typeof window === 'undefined') return null;
  
  try {
    const supported = await isSupported();
    if (supported) {
      messagingInstance = getMessaging(app);
      return messagingInstance;
    }
  } catch (err) {
    console.error('Firebase Messaging is not supported in this browser:', err);
  }
  return null;
};

export const messaging = null; // We'll use the async getter instead
export const googleProvider = new GoogleAuthProvider();

export const requestNotificationPermission = async () => {
  const msg = await getMessagingInstance();
  if (!msg) return null;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Note: A real VAPID key is required for production push notifications.
      // You can get this from the Firebase Console -> Project Settings -> Cloud Messaging.
      const vapidKey = (import.meta as any).env.VITE_FIREBASE_VAPID_KEY || undefined;
      
      const token = await getToken(msg, {
        vapidKey: vapidKey
      });
      return token;
    }
  } catch (error) {
    console.error('Error requesting notification permission:', error);
  }
  return null;
};

export const signInWithGoogle = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = () => signOut(auth);
