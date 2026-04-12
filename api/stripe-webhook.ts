// api/stripe-webhook.ts
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing stripe-signature", { status: 400 });

  // IMPORTANT: raw body text for signature verification
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return new Response(`Webhook signature verification failed: ${err?.message ?? ""}`, {
      status: 400,
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;

      if (!userId) return new Response(JSON.stringify({ received: true }), { status: 200 });

      // In subscription mode, session.subscription is typically the subscription id
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;

      let currentPeriodEnd: number | null = null;
      let status: Stripe.Subscription.Status | null = null;

      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        currentPeriodEnd = sub.current_period_end ?? null;
        status = sub.status;
        await supabase
          .from("user_access")
          .update({
            is_premium_subscriber: status === "active" || status === "trialing",
            subscription_tier: "premium",
            subscription_end_date: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
            stripe_customer_id: typeof sub.customer === "string" ? sub.customer : (sub.customer ?? null),
          })
          // ✅ adjust column name to your schema
          .eq("user_id", userId);
      }

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    if (event.type === "customer.subscription.updated") {
      const subObj = event.data.object as Stripe.Subscription;
      const subscriptionId = subObj.id;

      // user_id should be stored in subscription.metadata if you set it at creation time
      const userId = subObj.metadata?.user_id;
      if (!userId) return new Response(JSON.stringify({ received: true }), { status: 200 });

      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const currentPeriodEnd = sub.current_period_end ?? null;

      await supabase
        .from("user_access")
        .update({
          is_premium_subscriber: sub.status === "active" || sub.status === "trialing",
          subscription_tier: "premium",
          subscription_end_date: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
          stripe_customer_id: typeof sub.customer === "string" ? sub.customer : (sub.customer ?? null),
        })
        .eq("user_id", userId);

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    if (event.type === "customer.subscription.deleted") {
      const subObj = event.data.object as Stripe.Subscription;
      const userId = subObj.metadata?.user_id;
      if (!userId) return new Response(JSON.stringify({ received: true }), { status: 200 });

      await supabase
        .from("user_access")
        .update({
          is_premium_subscriber: false,
          subscription_tier: null,
          subscription_end_date: null,
        })
        .eq("user_id", userId);

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ignored: true }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Webhook failed" }), { status: 500 });
  }
}
