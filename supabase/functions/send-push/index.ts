import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
// Import firebase-admin via explicit ESM build for Deno support
import admin from "npm:firebase-admin";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Ensure firebase is only initialized once in Deno's global scope
if (!admin.apps.length) {
    // Get the service account string stored securely in Supabase Environment Secrets
    const serviceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!serviceAccountStr) {
        console.error("Missing FIREBASE_SERVICE_ACCOUNT secret.");
    } else {
        const serviceAccount = JSON.parse(serviceAccountStr);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin initialized");
    }
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { targetUserId, title, body } = await req.json();

        if (!targetUserId || !title || !body) {
            throw new Error("Missing required parameters: targetUserId, title, body");
        }

        // Use service role key to bypass RLS when fetching the target user's FCM token.
        // The DB trigger sends 'Bearer dummy' as the auth header, so using anon key
        // would cause auth.uid() to be null, blocking the RLS policy on fcm_tokens.
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        // Fetch the target user's FCM token
        const { data: tokenData, error: tokenError } = await supabaseClient
            .from('fcm_tokens')
            .select('token')
            .eq('user_id', targetUserId)
            .single();

        if (tokenError || !tokenData) {
            console.log(`No active FCM token found for user ${targetUserId}`);
            // Return success anyway, as this isn't strictly a failure—just an opted-out user
            return new Response(
                JSON.stringify({ message: 'No active push token. Notification skipped.' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        // Construct the message payload
        const message = {
            notification: {
                title,
                body,
            },
            token: tokenData.token, // Where to send it
        };

        // Send via Firebase Admin
        const response = await admin.messaging().send(message);
        console.log('Successfully sent message:', response);

        return new Response(
            JSON.stringify({ success: true, messageId: response }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error) {
        console.error('Error handling push notification:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
});
