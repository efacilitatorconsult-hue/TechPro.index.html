const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  // 1. Only allow "POST" requests (when someone clicks the button)
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
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
              description: 'Priority support and 177+ exclusive premium guides.'
            },
            unit_amount: 2900, // This is £29.00 in pence
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `https://usetechpro.com/success.html`,
      cancel_url: `https://usetechpro.com/pricing.html`,
    });

    // 3. Send the user to the Stripe Payment Page
    return {
      statusCode: 303,
      headers: { Location: session.url },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
