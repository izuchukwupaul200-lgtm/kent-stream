
const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const PORT = process.env.PORT || 3000;
const PRICE_NAIRA = 1200;
const PRICE_KOBO = 120000;
const CURRENCY = "NGN";

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_PUBLIC_KEY",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
  }
}

if (typeof fetch !== "function") {
  throw new Error("Node.js 18 or newer is required.");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// AUTHENTICATE USER
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

// PAYSTACK API REQUEST
async function paystackRequest(path, method = "GET", body = null) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(
    `https://api.paystack.co${path}`,
    options
  );

  const responseText = await response.text();
  let result;

  try {
    result = JSON.parse(responseText);
  } catch {
    console.error("PAYSTACK INVALID RESPONSE:", responseText.slice(0, 300));
    throw new Error("Paystack returned an invalid response.");
  }

  if (!response.ok || result.status !== true) {
    console.error("PAYSTACK API ERROR:", {
      httpStatus: response.status,
      message: result.message,
    });

    throw new Error(result.message || "Paystack request failed.");
  }

  return result.data;
}

// VERIFY TRANSACTION WITH PAYSTACK
async function verifyPaystackTransaction(reference) {
  return paystackRequest(
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
}

// FIND PENDING PAYMENT
async function findPendingPayment(reference, userId = null) {
  let query = supabase
    .from("paystack_pending_payments")
    .select("*")
    .eq("reference", reference);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("PENDING PAYMENT LOOKUP ERROR:", error);
    throw new Error("Could not find pending payment.");
  }

  return data;
}

// VALIDATE VERIFIED PAYMENT
function validatePaystackPayment(payment, pending) {
  if (!payment || payment.status !== "success") {
    throw new Error("Payment was not successful.");
  }

  if (payment.reference !== pending.reference) {
    throw new Error("Payment reference mismatch.");
  }

  if (payment.currency !== CURRENCY) {
    throw new Error("Payment currency mismatch.");
  }

  if (Number(payment.amount) !== PRICE_KOBO) {
    throw new Error("Payment amount does not match ₦1,200.");
  }

  if (
    payment.metadata?.user_id &&
    payment.metadata.user_id !== pending.user_id
  ) {
    throw new Error("Payment user mismatch.");
  }

  if (
    payment.customer?.email &&
    pending.email &&
    payment.customer.email.toLowerCase() !== pending.email.toLowerCase()
  ) {
    throw new Error("Payment email mismatch.");
  }

  if (!payment.id) {
    throw new Error("Paystack transaction ID is missing.");
  }

  return true;
}

// ACTIVATE SUBSCRIPTION AFTER VERIFIED PAYMENT
async function activateVerifiedPayment(payment, pending) {
  validatePaystackPayment(payment, pending);

  const { data: activated, error } = await supabase.rpc(
    "activate_kent_stream_paystack_payment",
    {
      p_transaction_id: String(payment.id),
      p_user_id: pending.user_id,
      p_reference: pending.reference,
      p_amount: Number(payment.amount) / 100,
      p_currency: payment.currency,
    }
  );

  if (error) {
    console.error("SUBSCRIPTION ACTIVATION ERROR:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });

    throw new Error("Subscription activation failed.");
  }

  if (activated !== true) {
    throw new Error("Supabase did not confirm activation.");
  }

  const { error: updateError } = await supabase
    .from("paystack_pending_payments")
    .update({
      status: "paid",
      transaction_id: String(payment.id),
    })
    .eq("reference", pending.reference)
    .eq("user_id", pending.user_id);

  if (updateError) {
    console.error("PENDING PAYMENT UPDATE ERROR:", updateError);
    throw new Error("Could not update pending payment.");
  }

  console.log("KENT STREAM PAYSTACK PAYMENT ACTIVATED:", {
    user_id: pending.user_id,
    reference: pending.reference,
    transaction_id: String(payment.id),
    amount: PRICE_NAIRA,
    currency: CURRENCY,
  });

  return true;
}

// HOME
app.get("/", (req, res) => {
  res.json({
    name: "KENT STREAM API",
    status: "running",
    payment_provider: "Paystack",
  });
});

// HEALTH CHECK
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// PAYSTACK WEBHOOK
// This must use the raw body before JSON parsing.
app.post(
  "/api/paystack/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req, res) => {
    try {
      const signature = req.headers["x-paystack-signature"];

      if (
        !signature ||
        !process.env.PAYSTACK_SECRET_KEY ||
        !Buffer.isBuffer(req.body)
      ) {
        return res.status(401).json({
          received: false,
          error: "Invalid webhook signature or body.",
        });
      }

      const expectedSignature = crypto
        .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
        .update(req.body)
        .digest("hex");

      const receivedBuffer = Buffer.from(String(signature));
      const expectedBuffer = Buffer.from(expectedSignature);

      if (
        receivedBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
      ) {
        return res.status(401).json({
          received: false,
          error: "Invalid webhook signature.",
        });
      }

      let event;

      try {
        event = JSON.parse(req.body.toString("utf8"));
      } catch {
        return res.status(400).json({
          received: false,
          error: "Invalid JSON.",
        });
      }

      if (event.event !== "charge.success") {
        return res.status(200).json({
          received: true,
          ignored: true,
        });
      }

      const reference = event.data?.reference;

      if (!reference) {
        return res.status(200).json({
          received: true,
          ignored: true,
          reason: "Reference missing.",
        });
      }

      const pending = await findPendingPayment(reference);

      if (!pending) {
        console.error("PAYSTACK WEBHOOK: Pending payment not found:", reference);

        return res.status(200).json({
          received: true,
          activated: false,
          reason: "Pending payment not found.",
        });
      }

      if (pending.status === "paid") {
        return res.status(200).json({
          received: true,
          activated: true,
          duplicate: true,
        });
      }

      // Verify directly with Paystack. Never trust the webhook alone.
      const payment = await verifyPaystackTransaction(reference);

      await activateVerifiedPayment(payment, pending);

      return res.status(200).json({
        received: true,
        activated: true,
      });
    } catch (error) {
      console.error("PAYSTACK WEBHOOK ERROR:", {
        message: error.message,
        stack: error.stack,
      });

      return res.status(500).json({
        received: false,
        error: "Webhook processing failed.",
      });
    }
  }
);

// JSON BODY PARSER FOR THE OTHER ROUTES
app.use(express.json({ limit: "1mb" }));

// PREPARE PAYSTACK PAYMENT
app.post("/api/paystack/prepare", async (req, res) => {
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

    const reference = `KENT-${user.id}-${crypto.randomUUID()}`;

    const { error: insertError } = await supabase
      .from("paystack_pending_payments")
      .insert({
        reference,
        user_id: user.id,
        email: user.email,
        amount: PRICE_NAIRA,
        currency: CURRENCY,
        status: "pending",
      });

    if (insertError) {
      console.error("CREATE PENDING PAYMENT ERROR:", insertError);

      return res.status(500).json({
        error: "Unable to prepare payment.",
      });
    }

    const checkout = await paystackRequest(
      "/transaction/initialize",
      "POST",
      {
        email: user.email,
        amount: String(PRICE_KOBO),
        currency: CURRENCY,
        reference,
        callback_url:
          "https://kent-stream.onrender.com/api/paystack/callback",
        metadata: {
          user_id: user.id,
          product: "KENT STREAM Monthly Subscription",
        },
      }
    );

    if (!checkout.authorization_url || checkout.reference !== reference) {
      throw new Error("Paystack checkout initialization was incomplete.");
    }

    return res.json({
      status: "success",
      public_key: process.env.PAYSTACK_PUBLIC_KEY,
      reference,
      amount: PRICE_NAIRA,
      currency: CURRENCY,
      authorization_url: checkout.authorization_url,
      access_code: checkout.access_code,
    });
  } catch (error) {
    console.error("PAYSTACK PREPARATION ERROR:", error);

    return res.status(500).json({
      error: "Payment preparation failed.",
    });
  }
});

// VERIFY PAYMENT FROM APP
app.post("/api/paystack/verify", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        error: "Please sign in first.",
      });
    }

    const reference = req.body?.reference;

    if (typeof reference !== "string" || !reference.trim()) {
      return res.status(400).json({
        error: "Payment reference is required.",
      });
    }

    const pending = await findPendingPayment(reference, user.id);

    if (!pending) {
      return res.status(404).json({
        error: "Payment reference not found.",
      });
    }

    if (pending.status === "paid") {
      return res.json({
        status: "success",
        paid: true,
        message: "Payment already confirmed.",
      });
    }

    const payment = await verifyPaystackTransaction(reference);

    await activateVerifiedPayment(payment, pending);

    return res.json({
      status: "success",
      paid: true,
      message: "Payment verified and subscription activated.",
    });
  } catch (error) {
    console.error("PAYSTACK VERIFICATION ERROR:", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(400).json({
      error: "Payment could not be verified. Please contact support.",
    });
  }
});

// RECOVER EXISTING PAYSTACK PAYMENTS
app.post("/api/paystack/recover", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        error: "Please sign in first.",
      });
    }

    const { data: pendingPayments, error } = await supabase
      .from("paystack_pending_payments")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .limit(10);

    if (error) {
      throw error;
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      return res.json({
        status: "success",
        paid: false,
        message: "No pending Paystack payments were found.",
      });
    }

    for (const pending of pendingPayments) {
      try {
        const payment = await verifyPaystackTransaction(pending.reference);

        await activateVerifiedPayment(payment, pending);

        return res.json({
          status: "success",
          paid: true,
          message: "Your payment was recovered and activated.",
        });
      } catch (verificationError) {
        console.log("PAYSTACK RECOVERY ATTEMPT:", {
          reference: pending.reference,
          reason: verificationError.message,
        });
      }
    }

    return res.json({
      status: "success",
      paid: false,
      message: "No successful Paystack payment was found.",
    });
  } catch (error) {
    console.error("PAYSTACK RECOVERY ERROR:", error);

    return res.status(500).json({
      error: "Payment recovery could not be completed.",
    });
  }
});

// PAYSTACK CALLBACK PAGE
app.get("/api/paystack/callback", (req, res) => {
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
        <h2>Payment submitted</h2>
        <p>Return to the KENT STREAM app to verify your subscription.</p>
      </body>
    </html>
  `);
});

// START SERVER
app.listen(PORT, "0.0.0.0", () => {
  console.log(`KENT STREAM API running on port ${PORT}`);
});
