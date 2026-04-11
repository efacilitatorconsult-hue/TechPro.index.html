// supabase/functions/create-checkout-session/index.ts
import Stripe from "npm:stripe@16.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.6";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Require auth (your Edge Function can’t know the user without the JWT)
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing Authorization Bearer token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.slice("Bearer ".length);

    const supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_ANON_KEY as string,
      {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false },
      }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Optional: base URL for redirects
    const origin = req.headers.get("Origin") ?? "";
    const siteUrl = process.env.SITE_URL ?? origin;
    if (!siteUrl) {
      return new Response(JSON.stringify({ error: "Missing SITE_URL or Origin header" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const baseUrl = siteUrl.replace(/\/$/, "");

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: 2900, // £29.00
            product_data: {
              name: "TechPro Premium Subscription",
              description: "Priority support and exclusive premium content",
            },
          },
        },
      ],

      // These are important for your webhook logic
      client_reference_id: userId,
      metadata: { user_id: userId },

      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/index.html`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Stripe session creation failed", details: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
