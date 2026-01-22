import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

let _stripeClient = null;
function getStripe() {
  if (_stripeClient) return _stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripeClient = new Stripe(key, { apiVersion: "2024-06-20" });
  return _stripeClient;
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const PRICE_IDS = {
  director: process.env.STRIPE_PRICE_DIRECTOR || "",
  studio: process.env.STRIPE_PRICE_STUDIO || "",
};

const PRICE_ID_TO_PLAN = Object.fromEntries(
  Object.entries(PRICE_IDS)
    .filter(([, id]) => id && id.startsWith("price_"))
    .map(([plan, id]) => [id, plan])
);

function normalizePlan(plan) {
  const safe = String(plan || "").trim().toLowerCase();
  return safe === "director" || safe === "studio" ? safe : "";
}

function resolvePlanFromSubscription(sub) {
  const items = sub?.items?.data || [];
  for (const item of items) {
    const priceId = typeof item?.price === "string" ? item.price : item?.price?.id;
    if (priceId && PRICE_ID_TO_PLAN[priceId]) {
      return PRICE_ID_TO_PLAN[priceId];
    }
  }
  return "";
}

async function upsertPlan(supabase, payload) {
  // Requires profiles columns: plan, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end
  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export default async function stripeWebhook(req, res) {
  const stripe = getStripe();
  if (!stripe) return res.status(400).send("Stripe not configured");

  const sig = req.headers["stripe-signature"];
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret) return res.status(400).send("Missing STRIPE_WEBHOOK_SECRET");

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, whSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err?.message);
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  try {
    const supabase = getSupabaseAdmin();
    // If supabase isn't configured, we still return 200 so Stripe doesn't retry forever.
    if (!supabase) {
      console.warn("Supabase admin not configured; skipping plan sync.");
      return res.status(200).json({ received: true });
    }

    // Helper to resolve userId from event objects
    const extractMeta = (obj) => {
      const userId = obj?.metadata?.userId || obj?.client_reference_id || "";
      return { userId };
    };

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const { userId } = extractMeta(session);
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (userId) {
        // Fetch subscription to get status + period end
        let sub = null;
        try {
          sub = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null;
        } catch (e) {}

        const planFromSub = sub ? resolvePlanFromSubscription(sub) : "";
        const fallbackPlan = normalizePlan(session?.metadata?.plan);
        const resolvedPlan = planFromSub || fallbackPlan;
        if (!planFromSub && fallbackPlan) {
          console.warn(
            "Stripe webhook: falling back to session metadata plan; price ID did not match env."
          );
        }

        const payload = {
          id: userId,
          stripe_customer_id: customerId || null,
          stripe_subscription_id: subscriptionId || null,
          subscription_status: sub?.status || "active",
          current_period_end: sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        };
        if (resolvedPlan) payload.plan = resolvedPlan;

        await upsertPlan(supabase, payload);
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const sub = event.data.object;
      const { userId } = extractMeta(sub);

      if (userId) {
        const planFromSub = resolvePlanFromSubscription(sub);
        const fallbackPlan = normalizePlan(sub?.metadata?.plan);
        const resolvedPlan = planFromSub || fallbackPlan;
        if (!planFromSub && fallbackPlan) {
          console.warn(
            "Stripe webhook: falling back to subscription metadata plan; price ID did not match env."
          );
        }

        const payload = {
          id: userId,
          stripe_customer_id: sub.customer || null,
          stripe_subscription_id: sub.id || null,
          subscription_status: sub.status || null,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        };
        if (resolvedPlan) payload.plan = resolvedPlan;

        await upsertPlan(supabase, payload);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const { userId } = extractMeta(sub);

      if (userId) {
        await upsertPlan(supabase, {
          id: userId,
          plan: "free",
          stripe_customer_id: sub.customer || null,
          stripe_subscription_id: null,
          subscription_status: "canceled",
          current_period_end: null,
        });
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("stripeWebhook handler error:", err);
    return res.status(200).json({ received: true }); // prevent retries while you fix schema
  }
}
