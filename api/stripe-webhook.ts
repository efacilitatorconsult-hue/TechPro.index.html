import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );
  } catch (error) {
    console.error('Webhook verification error:', error);
    res.status(400).json({ error: 'Webhook verification failed' });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout session completed:', session.id);

        // Update user_access table in Supabase
        if (session.client_reference_id) {
          const { error: updateError } = await supabase
            .from('user_access')
            .update({
              is_premium_subscriber: true,
              stripe_customer_id: session.customer as string,
              stripe_session_id: session.id,
              premium_activated_at: new Date().toISOString(),
            })
            .eq('user_id', session.client_reference_id);

          if (updateError) {
            console.error('Error updating user access:', updateError);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription cancelled:', subscription.id);

        // Update user_access table to revoke premium
        const { error: updateError } = await supabase
          .from('user_access')
          .update({
            is_premium_subscriber: false,
            premium_cancelled_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', subscription.customer as string);

        if (updateError) {
          console.error('Error updating subscription cancellation:', updateError);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log('Payment failed:', invoice.id);
        // Handle failed payment - send email notification, etc.
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}
