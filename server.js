
const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const PORT = process.env.PORT || 3000;
const PRICE = 1200;
const CURRENCY = "NGN";

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FLW_SECRET_KEY",
  "FLW_WEBHOOK_HASH",
  "FLW_REDIRECT_URL",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.get("/", (req, res) => {
  res.json({ name: "KENT STREAM API", status: "running" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Flutterwave webhook: retain raw body for signature verification.
app.post(
  "/api/flutterwave/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["verif-hash"];

      if (
        !signature ||
        !process.env.FLW_WEBHOOK_HASH ||
        signature !== process.env.FLW_WEBHOOK_HASH
      ) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }

      const event = JSON.parse(req.body.toString("utf8"));
      const transactionId = event?.data?.id;

      if (!transactionId) {
        return res.status(200).json({ received: true });
      }

      const verifyResponse = await fetch(
        `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
        {
          headers: {
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          },
        }
      );

      const verification = await verifyResponse.json();
      const payment = verification?.data;

      if (
        !verifyResponse.ok ||
        verification.status !== "success" ||
        payment?.status !== "successful" ||
        Number(payment.amount) < PRICE ||
        payment.currency !== CURRENCY
      ) {
        return res.status(400).json({ error: "Payment verification failed" });
      }

      const userId = payment.meta?.user_id;

      if (!userId) {
        return res.status(400).json({ error: "Missing user metadata" });
      }

      const { error } = await supabase.rpc(
        "activate_kent_stream_payment",
        {
          p_user_id: userId,
          p_transaction_id: String(transactionId),
          p_amount: Number(payment.amount),
          p_currency: payment.currency,
        }
      );

      if (error) {
        console.error("Subscription activation error:", error);
        return res.status(500).json({ error: "Activation failed" });
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

app.use(express.json());

// Authenticated checkout creation.
app.post("/api/flutterwave/checkout", async (req, res) => {
  try {
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.substring(7)
      : "";

    if (!token) {
      return res.status(401).json({ error: "Please sign in first" });
    }

    const { data: authData, error: authError } =
      await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const user = authData.user;

    const txRef = `KENT-${user.id}-${crypto.randomUUID()}`;

    const checkoutResponse = await fetch(
      "https://api.flutterwave.com/v3/payments",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tx_ref: txRef,
          amount: PRICE,
          currency: CURRENCY,
          redirect_url: process.env.FLW_REDIRECT_URL,
          customer: {
            email: user.email,
            name: user.user_metadata?.full_name || "KENT STREAM User",
          },
          meta: {
            user_id: user.id,
            product: "KENT STREAM Monthly Subscription",
          },
          customizations: {
            title: "KENT STREAM",
            description: "Monthly subscription",
          },
        }),
      }
    );

    const result = await checkoutResponse.json();

    if (!checkoutResponse.ok || result.status !== "success") {
      console.error("Flutterwave checkout error:", result);
      return res.status(502).json({
        error: result.message || "Unable to create checkout",
      });
    }

    return res.json({
      status: "success",
      checkout_url: result.data.link,
      tx_ref: txRef,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return res.status(500).json({ error: "Checkout creation failed" });
  }
});

app.get("/api/flutterwave/redirect", (req, res) => {
  res.send("KENT STREAM payment received. Subscription activation is being verified.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`KENT STREAM API running on port ${PORT}`);
});
