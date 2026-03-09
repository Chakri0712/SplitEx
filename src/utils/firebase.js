import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { supabase } from "../supabaseClient";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBSjC-mnHOu9QuW5bHR-yRGPUthcAuOj6g",
    authDomain: "one-piece-2000.firebaseapp.com",
    projectId: "one-piece-2000",
    storageBucket: "one-piece-2000.firebasestorage.app",
    messagingSenderId: "117127515942",
    appId: "1:117127515942:web:979b4441bf42b0d876bbe7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Defensive messaging initialization
let messaging = null;
try {
    messaging = getMessaging(app);
} catch (err) {
    console.warn("Firebase Messaging is not supported in this browser environment or origin.", err);
}

export { messaging };

/**
 * Requests notification permissions and registers the FCM token to the Supabase database.
 * Requires a VAPID key to hook onto Web Push correctly.
 */
// src/utils/firebase.js
export const requestNotificationPermission = async (userId, vapidKey) => {
    if (!messaging) {
        throw new Error("Firebase Messaging is not supported in this browser environment. Push notifications require HTTPS or localhost (Secure Context).");
    }

    try {
        if (!('Notification' in window)) {
            throw new Error("Notifications not supported in this browser.");
        }

        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            const currentToken = await getToken(messaging, { vapidKey });

            if (currentToken) {
                console.log("FCM Token retrieved.");
                // Store the token in Supabase
                const { error } = await supabase
                    .from("fcm_tokens")
                    .upsert({ user_id: userId, token: currentToken }, { onConflict: 'token' });

                if (error) {
                    console.error("Error saving FCM token to DB:", error);
                } else {
                    console.log("FCM token saved successfully.");
                }

                return currentToken;
            } else {
                throw new Error("No registration token available.");
            }
        } else {
            throw new Error("Notification permission not granted by user.");
        }
    } catch (error) {
        console.error("An error occurred while retrieving token.", error);
        throw error;
    }
};

/**
 * Listener for incoming messages while the app is in the foreground.
 */
export const onMessageListener = () =>
    new Promise((resolve) => {
        if (!messaging) return;
        onMessage(messaging, (payload) => {
            resolve(payload);
        });
    });
