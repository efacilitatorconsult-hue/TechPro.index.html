const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // 1. Only allow POST requests (Standard for Stripe forms)
  if (req.method !== "POST") {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // 2. Create the Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: { 
              name: 'TechPro Premium Subscription',
              description: 'Priority support and exclusive premium content'
            },
            unit_amount: 2900, // £29.00
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // Using req.headers.origin ensures this works on your Vercel URL automatically
      success_url: `${req.headers.origin}/success.html`,
      cancel_url: `${req.headers.origin}/pricing.html`,
    });

    // 3. Redirect the user to the Stripe Checkout page
    return res.redirect(303, session.url);
    
  } catch (error) {
    console.error("Stripe Error:", error.message);
    return res.status(500).json({ 
      error: "Internal Server Error", 
      details: error.message 
    });
  }
}
