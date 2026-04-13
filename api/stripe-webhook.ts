// api/stripe-webhook.ts
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!stripeSecretKey || !webhookSecret) {
  throw new Error("Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
}
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2024-06-20",
});

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  // IMPORTANT: raw body text for signature verification
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook signature verification failed";
    return new Response(`Webhook signature verification failed: ${message}`, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = typeof session.metadata?.user_id === "string" ? session.metadata.user_id : null;

      // Always return 200 so Stripe doesn't retry endlessly
      if (!userId) return new Response(JSON.stringify({ received: true }), { status: 200 });

      // In subscription mode, session.subscription is the subscription id (string)
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
      if (!subscriptionId) {
        // If you're using subscription checkout, you should have this.
        return new Response(JSON.stringify({ received: true, warning: "No subscription id on session" }), {
          status: 200,
        });
      }

      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const currentPeriodEnd = sub.current_period_end ?? null;

      const stripeCustomerId =
        typeof sub.customer === "string" ? sub.customer : (sub.customer ?? null);

      const status = sub.status;

      const { error } = await supabase
        .from("user_access")
        .update({
          is_premium_subscriber: status === "active" || status === "trialing",
          subscription_tier: "premium",
          subscription_end_date: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
          stripe_customer_id: stripeCustomerId,
        })
        .eq("user_id", userId);

      if (error) throw error;

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    if (event.type === "customer.subscription.updated") {
      const subObj = event.data.object as Stripe.Subscription;
      const userId =
        typeof subObj.metadata?.user_id === "string" ? subObj.metadata.user_id : null;

      if (!userId) return new Response(JSON.stringify({ received: true }), { status: 200 });

      const sub = await stripe.subscriptions.retrieve(subObj.id);
      const currentPeriodEnd = sub.current_period_end ?? null;

      const stripeCustomerId =
        typeof sub.customer === "string" ? sub.customer : (sub.customer ?? null);

      const { error } = await supabase
        .from("user_access")
        .update({
          is_premium_subscriber: sub.status === "active" || sub.status === "trialing",
          subscription_tier: "premium",
          subscription_end_date: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
          stripe_customer_id: stripeCustomerId,
        })
        .eq("user_id", userId);

      if (error) throw error;

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    if (event.type === "customer.subscription.deleted") {
      const subObj = event.data.object as Stripe.Subscription;
      const userId =
        typeof subObj.metadata?.user_id === "string" ? subObj.metadata.user_id : null;

      if (!userId) return new Response(JSON.stringify({ received: true }), { status: 200 });

      const { error } = await supabase
        .from("user_access")
        .update({
          is_premium_subscriber: false,
          subscription_tier: null,
          subscription_end_date: null,
        })
        .eq("user_id", userId);

      if (error) throw error;

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ignored: true }), { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Webhook failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
          }
