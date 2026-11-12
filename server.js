
const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const PORT = process.env.PORT || 3000;
const PRICE = 1200;
const CURRENCY = "NGN";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FLW_SECRET_KEY",
  "FLW_PUBLIC_KEY",
  "FLW_WEBHOOK_HASH",
  "FLW_REDIRECT_URL",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
  }
}

if (typeof fetch !== "function") {
  throw new Error("Node.js 18 or newer is required.");
}

// Verify the authenticated KENT user.
async function getAuthenticatedUser(req) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.substring(7);

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return null;
  }

  return data.user;
}

// Verify a transaction directly with Flutterwave.
async function verifyWithFlutterwave(transactionId) {
  const response = await fetch(
    `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(
      transactionId
    )}/verify`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
      },
    }
  );

  const result = await response.json();

  if (
    !response.ok ||
    result.status !== "success" ||
    result.data?.status !== "successful"
  ) {
    throw new Error("Flutterwave transaction verification failed.");
  }

  return result.data;
}

// Activate a verified payment.
// The pending record must belong to the expected user and tx_ref.
async function activateVerifiedPayment(payment, pending) {
  const transactionId = String(payment.id);

  if (
    payment.status !== "successful" ||
    Number(payment.amount) !== PRICE ||
    payment.currency !== CURRENCY ||
    payment.tx_ref !== pending.tx_ref
  ) {
    throw new Error("Payment details do not match.");
  }

  if (payment.meta?.user_id &&
      payment.meta.user_id !== pending.user_id) {
    throw new Error("Payment user mismatch.");
  }

  // Ensure this transaction has not already been used
  // with another pending reference.
  const { data: existingPayment, error: existingError } =
    await supabase
      .from("flutterwave_payments")
      .select("transaction_id, user_id, tx_ref")
      .eq("transaction_id", transactionId)
      .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingPayment) {
    if (
      existingPayment.user_id !== pending.user_id ||
      existingPayment.tx_ref !== pending.tx_ref
    ) {
      throw new Error("Transaction already belongs to another payment.");
    }

    await supabase
      .from("flutterwave_pending_payments")
      .update({
        status: "paid",
        transaction_id: transactionId,
      })
      .eq("tx_ref", pending.tx_ref);

    return true;
  }

  const { data: activated, error } = await supabase.rpc(
    "activate_kent_stream_payment",
    {
      p_transaction_id: transactionId,
      p_user_id: pending.user_id,
      p_tx_ref: pending.tx_ref,
      p_amount: Number(payment.amount),
      p_currency: payment.currency,
    }
  );

  if (error) {
    throw error;
  }

  // Mark the pending transaction as paid.
  const { error: updateError } = await supabase
    .from("flutterwave_pending_payments")
    .update({
      status: "paid",
      transaction_id: transactionId,
    })
    .eq("tx_ref", pending.tx_ref);

  if (updateError) {
    throw updateError;
  }

  return activated === true;
}

// HOME
app.get("/", (req, res) => {
  res.json({
    name: "KENT STREAM API",
    status: "running",
  });
});

// HEALTH CHECK
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// PREPARE IN-APP FLUTTERWAVE PAYMENT
app.post(
  "/api/flutterwave/prepare",
  express.json(),
  async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);

      if (!user) {
        return res.status(401).json({
          error: "Please sign in first.",
        });
      }

      if (!user.email) {
        return res.status(400).json({
          error: "Your account needs an email address.",
        });
      }

      if (!process.env.FLW_PUBLIC_KEY) {
        return res.status(500).json({
          error: "Payment configuration is incomplete.",
        });
      }

      const txRef = `KENT-${user.id}-${crypto.randomUUID()}`;

      const { error } = await supabase
        .from("flutterwave_pending_payments")
        .insert({
          tx_ref: txRef,
          user_id: user.id,
          amount: PRICE,
          currency: CURRENCY,
          status: "pending",
        });

      if (error) {
        console.error("Pending payment creation error:", error);

        return res.status(500).json({
          error: "Unable to prepare payment.",
        });
      }

      return res.json({
        status: "success",
        public_key: process.env.FLW_PUBLIC_KEY,
        tx_ref: txRef,
        amount: PRICE,
        currency: CURRENCY,
        redirect_url: process.env.FLW_REDIRECT_URL,
        customer: {
          email: user.email,
          name:
            user.user_metadata?.full_name ||
            "KENT STREAM User",
          phone: user.phone || "",
        },
      });
    } catch (error) {
      console.error("Payment preparation error:", error);

      return res.status(500).json({
        error: "Payment preparation failed.",
      });
    }
  }
);

// VERIFY IN-APP PAYMENT
app.post(
  "/api/flutterwave/verify",
  express.json(),
  async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);

      if (!user) {
        return res.status(401).json({
          error: "Please sign in first.",
        });
      }

      const txRef = req.body?.tx_ref;
      const transactionId = req.body?.transaction_id;

      if (
        typeof txRef !== "string" ||
        typeof transactionId !== "string" ||
        !txRef ||
        !transactionId
      ) {
        return res.status(400).json({
          error: "Transaction reference and ID are required.",
        });
      }

      const { data: pending, error: pendingError } =
        await supabase
          .from("flutterwave_pending_payments")
          .select("*")
          .eq("tx_ref", txRef)
          .eq("user_id", user.id)
          .maybeSingle();

      if (pendingError) {
        throw pendingError;
      }

      if (!pending) {
        return res.status(404).json({
          error: "Payment reference not found.",
        });
      }

      if (pending.status === "paid") {
        return res.json({
          status: "success",
          paid: true,
          message: "Subscription payment already confirmed.",
        });
      }

      const payment = await verifyWithFlutterwave(transactionId);

      if (payment.tx_ref !== txRef) {
        return res.status(400).json({
          error: "Transaction reference mismatch.",
        });
      }

      if (
        payment.customer?.email &&
        payment.customer.email.toLowerCase() !==
          user.email.toLowerCase()
      ) {
        return res.status(400).json({
          error: "Customer email does not match.",
        });
      }

      await activateVerifiedPayment(payment, pending);

      return res.json({
        status: "success",
        paid: true,
        message: "Subscription payment verified.",
      });
    } catch (error) {
      console.error("Payment verification error:", error);

      return res.status(400).json({
        error: "Payment could not be verified. Please try again.",
      });
    }
  }
);

// FLUTTERWAVE WEBHOOK
// This route uses raw request data for signature verification.
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
        return res.status(401).json({
          error: "Invalid webhook signature.",
        });
      }

      const event = JSON.parse(req.body.toString("utf8"));
      const transactionId = event?.data?.id;

      if (!transactionId) {
        return res.status(200).json({ received: true });
      }

      const payment = await verifyWithFlutterwave(
        String(transactionId)
      );

      if (
        payment.status !== "successful" ||
        Number(payment.amount) !== PRICE ||
        payment.currency !== CURRENCY ||
        !payment.tx_ref
      ) {
        return res.status(400).json({
          error: "Invalid payment details.",
        });
      }

      const { data: pending, error } = await supabase
        .from("flutterwave_pending_payments")
        .select("*")
        .eq("tx_ref", payment.tx_ref)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!pending) {
        return res.status(404).json({
          error: "Pending payment not found.",
        });
      }

      await activateVerifiedPayment(payment, pending);

      return res.status(200).json({
        received: true,
        activated: true,
      });
    } catch (error) {
      console.error("Webhook processing error:", error);

      return res.status(500).json({
        error: "Webhook processing failed.",
      });
    }
  }
);

// FLUTTERWAVE PAYMENT RETURN PAGE
app.get("/api/flutterwave/redirect", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>KENT STREAM Payment</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="
        background:#080808;
        color:white;
        font-family:Arial;
        text-align:center;
        padding:60px 20px;
      ">
        <h1 style="color:#E50920">KENT STREAM</h1>
        <h2>Payment received</h2>
        <p>Your transaction is being verified.</p>
        <p>Return to the KENT STREAM app to check your subscription.</p>
      </body>
    </html>
  `);
});

// START SERVER
app.listen(PORT, "0.0.0.0", () => {
  console.log(`KENT STREAM API running on port ${PORT}`);
});
