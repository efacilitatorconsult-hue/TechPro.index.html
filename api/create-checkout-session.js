import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized: Missing authorization header' });
    }

    // Accept either:
    // 1) "Bearer <token>" OR
    // 2) "<token>" (what your frontend currently sends)
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : authHeader.trim();

    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    const userId = authData.user.id;

    const email = req.body?.email;
    if (!email) {
      return res.status(400).json({ error: 'Missing email in request body' });
    }

    // Create checkout session for TechPro Premium
    // Note: mode: 'subscription' means you must use a Price configured for recurring billing in Stripe.
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: 'TechPro Premium',
              description: 'Gaming Hardware Guide + Full Content Library + Priority Support',
              images: ['https://techpro.example.com/techpro-logo.png'],
            },
            unit_amount: 2900, // £29.00 (Stripe expects pence for GBP)
            // IMPORTANT: For subscriptions, Stripe needs recurring pricing.
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      billing_address_collection: 'auto',
      customer_email: email,
      client_reference_id: userId,

      // Use NEXT_PUBLIC/Vercel frontend origin if possible; fallback to req.headers.origin
      success_url: `${req.headers.origin || process.env.SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || process.env.SITE_URL}`,

      subscription_data: {
        trial_period_days: 7,
        metadata: {
          product: 'techpro_premium',
          plan: 'monthly',
          user_id: userId,
        },
      },
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Checkout session error:', error);
    return res.status(500).json({
      error: error?.message || 'Error creating checkout session',
    });
  }
}
