import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import getRawBody from 'raw-body';

// If your setup supports it, ensure body is not parsed.
export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (error) {
    console.error('Webhook verification error:', error);
    return res.status(400).json({ error: 'Webhook verification failed' });
  }

  console.log('stripe event received:', { type: event.type, id: event.id });

  try {
    /**
     * 1) checkout.session.completed
     * - Use stripe_customer_id as the canonical unique key
     * - Upsert by stripe_customer_id (matches UNIQUE constraint)
     * - Idempotent-ish: only set activated timestamp if we were not premium
     */
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const userId = session.client_reference_id as string | null;
      const customerId = session.customer as string | null;

      console.log('session.completed payload used:', {
        sessionId: session.id,
        client_reference_id: session.client_reference_id,
        customer: session.customer,
      });

      if (!userId || !customerId) {
        console.warn('Missing client_reference_id or customer on session:', session.id);
        return res.status(200).json({ received: true });
      }

      // Fetch current state so we can avoid timestamp flipping on retries/out-of-order
      const { data: existing, error: fetchErr } = await supabase
        .from('user_access')
        .select('is_premium_subscriber')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();

      if (fetchErr) {
        console.error('Error fetching existing user_access:', fetchErr);
        return res.status(500).json({ error: 'Failed to read current subscription state' });
      }

      const wasPremium = existing?.is_premium_subscriber === true;

      const activatedAt = !wasPremium ? new Date().toISOString() : null;

      const payload: Record<string, any> = {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_session_id: session.id,
        is_premium_subscriber: true,
      };

      // Only set premium_activated_at when transitioning from not-premium -> premium
      if (activatedAt) payload.premium_activated_at = activatedAt;

      const { data, error } = await supabase
        .from('user_access')
        .upsert(payload, { onConflict: 'stripe_customer_id' });

      console.log('upsert result:', { userId, customerId, error, data });

      if (error) console.error('Error upserting user_access:', error);
    }

    /**
     * 2) customer.subscription.deleted
     * - Update by stripe_customer_id (matches UNIQUE constraint)
     * - Only set cancelled timestamp if we were premium
     */
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string | null;

      if (!customerId) return res.status(200).json({ received: true });

      // Fetch current state so we can avoid re-writing cancelled_at on repeats
      const { data: existing, error: fetchErr } = await supabase
        .from('user_access')
        .select('is_premium_subscriber')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();

      if (fetchErr) {
        console.error('Error fetching existing user_access:', fetchErr);
        return res.status(500).json({ error: 'Failed to read current subscription state' });
      }

      const wasPremium = existing?.is_premium_subscriber === true;

      const cancelledAt = wasPremium ? new Date().toISOString() : null;

      const updatePayload: Record<string, any> = {
        is_premium_subscriber: false,
      };

      if (cancelledAt) updatePayload.premium_cancelled_at = cancelledAt;

      const { error } = await supabase
        .from('user_access')
        .update(updatePayload)
        .eq('stripe_customer_id', customerId);

      if (error) console.error('Error updating cancellation:', error);
    }

    // You can add more cases later (e.g. subscription.updated) using the same patterns.

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const userId = session.client_reference_id;
      const customerId = session.customer as string;

      // ✅ Log 2: confirm critical payload fields used by your code
      console.log('session.completed payload used:', {
        sessionId: session.id,
        client_reference_id: session.client_reference_id,
        customer: session.customer,
      });

      if (!userId || !customerId) {
        console.warn('Missing client_reference_id or customer on session:', session.id);
        return res.status(200).json({ received: true });
      }

      // ✅ upsert instead of update
      const { data, error } = await supabase
        .from('user_access')
        .upsert(
          {
            user_id: userId,
            is_premium_subscriber: true,
            stripe_customer_id: customerId,
            stripe_session_id: session.id,
            premium_activated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      // ✅ Log 3: confirm whether the write succeeded
      console.log('upsert result:', { userId, customerId, error, data });

      if (error) console.error('Error upserting user_access:', error);
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      if (!customerId) return res.status(200).json({ received: true });

      const { error } = await supabase
        .from('user_access')
        .update({
          is_premium_subscriber: false,
          premium_cancelled_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', customerId);

      if (error) console.error('Error updating cancellation:', error);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}
