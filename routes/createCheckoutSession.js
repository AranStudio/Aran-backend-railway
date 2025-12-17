import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

export default async function createCheckoutSession(req, res, next) {
  try {
    const { plan, userId } = req.body || {};

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
    }

    const normalizedPlan = String(plan || "").toLowerCase();
    const priceId =
      normalizedPlan === "director"
        ? process.env.STRIPE_PRICE_DIRECTOR
        : normalizedPlan === "studio"
          ? process.env.STRIPE_PRICE_STUDIO
          : null;

    if (!priceId) {
      return res.status(400).json({ error: "Invalid plan. Use 'director' or 'studio'." });
    }

    const frontendUrl = process.env.FRONTEND_URL || "https://www.aran.studio";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/upgrade-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/pricing`,
      // Helps you reconcile later (webhooks) without trusting the client.
      client_reference_id: userId ? String(userId) : undefined,
      metadata: {
        plan: normalizedPlan,
        userId: userId ? String(userId) : "",
      },
      allow_promotion_codes: true,
    });

    return res.json({ url: session.url });
  } catch (err) {
    return next(err);
  }
}
