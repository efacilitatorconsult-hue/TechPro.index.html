import Stripe from "stripe";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const stripe = new Stripe(
  Deno.env.get("STRIPE_SECRET_KEY")!,
  { apiVersion: "2024-06-20" }
);

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text(); // IMPORTANT: raw body for signature verification
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e) {
    return new Response("Webhook verification failed", { status: 400 });
  }

  // TODO: keep your checkout.session.completed + customer.subscription.deleted logic here,
  // but replace req/res stuff with edge returns.

  return new Response(JSON.stringify({ received: true }), { headers: { "content-type": "application/json" }});
});
