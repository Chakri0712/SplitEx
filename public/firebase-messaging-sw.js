// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyBSjC-mnHOu9QuW5bHR-yRGPUthcAuOj6g",
    authDomain: "one-piece-2000.firebaseapp.com",
    projectId: "one-piece-2000",
    storageBucket: "one-piece-2000.firebasestorage.app",
    messagingSenderId: "117127515942",
    appId: "1:117127515942:web:979b4441bf42b0d876bbe7"
};

// Initialize Firebase App
firebase.initializeApp(firebaseConfig);

// Set up Firebase Cloud Messaging
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/logo.png', // Fallback to your web app icon
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
