import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized: Missing authorization header' });
    }

    // Create checkout session for TechPro Premium
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
            unit_amount: 2900, // £29.00
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      billing_address_collection: 'auto',
      customer_email: req.body.email || undefined,
      client_reference_id: req.body.userId || undefined,
      success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}`,
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          product: 'techpro_premium',
          plan: 'monthly',
        },
      },
    });

    res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({
      error: error.message || 'Error creating checkout session',
    });
  }
}
