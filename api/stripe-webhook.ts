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

const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function getUserIdFromMetadata(obj: { metadata?: Stripe.Metadata | null } | any): string | null {
  const userId = obj?.metadata?.user_id;
  return typeof userId === "string" ? userId : null;
}

async function markEventProcessed(eventId: string, eventType: string) {
  // Insert + ignore duplicates (Stripe retries)
  const { error } = await supabase
    .from("stripe_webhook_events")
    .insert({ event_id: eventId, event_type: eventType })
    .select("event_id")
    .maybeSingle();

  if (error) {
    const msg = String(error.message || "");
    // Duplicate PK is safe to ignore; other errors should fail
    if (!msg.toLowerCase().includes("duplicate")) throw error;
  }
}

async function updateUserAccessFromSubscription(
  sub: Stripe.Subscription,
  userId: string,
  eventId: string
) {
  const currentPeriodEnd = sub.current_period_end ?? null;
  const stripeCustomerId =
    typeof sub.customer === "string" ? sub.customer : (sub.customer ?? null);

  const isPremium = sub.status === "active" || sub.status === "trialing";

  const { error } = await supabase
    .from("user_access")
    .update({
      is_premium_subscriber: isPremium,
      subscription_tier: isPremium ? "premium" : null,
      subscription_end_date: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
      stripe_customer_id: stripeCustomerId,
      stripe_last_event_id: eventId,
    })
    .eq("user_id", userId);

  if (error) throw error;
}

async function enablePremiumForPayment(userId: string, eventId: string) {
  const { error } = await supabase
    .from("user_access")
    .update({
      is_premium_subscriber: true,
      subscription_tier: "premium",
      subscription_end_date: null,
      stripe_last_event_id: eventId,
    })
    .eq("user_id", userId);

  if (error) throw error;
}

async function unsetUserPremium(userId: string, eventId: string) {
  const { error } = await supabase
    .from("user_access")
    .update({
      is_premium_subscriber: false,
      subscription_tier: null,
      subscription_end_date: null,
      stripe_last_event_id: eventId,
    })
    .eq("user_id", userId);

  if (error) throw error;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing stripe-signature", { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook signature verification failed";
    return new Response(`Webhook signature verification failed: ${message}`, { status: 400 });
  }

  try {
    const eventId = event.id;

    // Idempotency
    await markEventProcessed(eventId, event.type);

    // ✅ Your current checkout flow: mode="payment"
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = typeof session.metadata?.user_id === "string" ? session.metadata.user_id : null;

      if (!userId) return new Response(JSON.stringify({ received: true }), { status: 200 });

      // If subscription checkout is ever used, you can still support it:
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;

      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await updateUserAccessFromSubscription(sub, userId, eventId);
      } else {
        // ✅ Payment mode: just enable premium (no subscription_end_date)
        await enablePremiumForPayment(userId, eventId);
      }

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Subscription events (only relevant if you later switch to subscription checkout)
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const subObj = event.data.object as Stripe.Subscription;
      const userId = getUserIdFromMetadata(subObj);
      if (!userId) return new Response(JSON.stringify({ received: true }), { status: 200 });

      const sub = await stripe.subscriptions.retrieve(subObj.id);
      await updateUserAccessFromSubscription(sub, userId, eventId);
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    if (event.type === "customer.subscription.deleted") {
      const subObj = event.data.object as Stripe.Subscription;
      const userId = getUserIdFromMetadata(subObj);
      if (!userId) return new Response(JSON.stringify({ received: true }), { status: 200 });

      await unsetUserPremium(userId, eventId);
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Payment intent events (optional extra safety)
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const userId = getUserIdFromMetadata(pi);
      if (!userId) return new Response(JSON.stringify({ received: true }), { status: 200 });

      // If this PI was tied to a subscription, use it; otherwise enable premium best-effort
      const subscriptionId = typeof pi.subscription === "string" ? pi.subscription : null;
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await updateUserAccessFromSubscription(sub, userId, eventId);
      } else {
        await enablePremiumForPayment(userId, eventId);
      }

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const userId = getUserIdFromMetadata(pi);
      if (!userId) return new Response(JSON.stringify({ received: true }), { status: 200 });

      await unsetUserPremium(userId, eventId);
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Default: acknowledge
    return new Response(JSON.stringify({ ignored: true, type: event.type }), { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Webhook failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
      }
