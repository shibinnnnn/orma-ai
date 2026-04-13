// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyALlsgoJb8qr2_geNz9T3H3V-Ph0P0rYxg",
  authDomain: "gen-lang-client-0447027557.firebaseapp.com",
  projectId: "gen-lang-client-0447027557",
  storageBucket: "gen-lang-client-0447027557.firebasestorage.app",
  messagingSenderId: "498350324196",
  appId: "1:498350324196:web:95b13da0cbbabd4c6deff1"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
