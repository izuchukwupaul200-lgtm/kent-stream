
const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const PORT = process.env.PORT || 3000;
const PRICE = 1200;
const PRICE_KOBO = PRICE * 100;
const CURRENCY = "NGN";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PAYSTACK_SECRET_KEY",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
  }
}

if (typeof fetch !== "function") {
  throw new Error("Node.js 18 or newer is required.");
}

const PAYSTACK_API = "https://api.paystack.co";

const BASE_URL = (
  process.env.RENDER_EXTERNAL_URL ||
  "https://kent-stream.onrender.com"
).replace(/\/$/, "");

const CALLBACK_URL =
  process.env.PAYSTACK_CALLBACK_URL ||
  `${BASE_URL}/api/paystack/callback`;

// --------------------------------------------------
// AUTHENTICATE KENT USER
// --------------------------------------------------

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

// --------------------------------------------------
// PAYSTACK API REQUEST
// --------------------------------------------------

async function paystackRequest(endpoint, options = {}) {
  const response = await fetch(
    `${PAYSTACK_API}${endpoint}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    }
  );

  const responseText = await response.text();

  let result;

  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error("Invalid response from Paystack.");
  }

  if (!response.ok || result.status !== true) {
    console.error("Paystack API error:", {
      httpStatus: response.status,
      message: result.message,
    });

    throw new Error(
      result.message || "Paystack request failed."
    );
  }

  return result.data;
}

// --------------------------------------------------
// VERIFY PAYSTACK TRANSACTION
// --------------------------------------------------

async function verifyWithPaystack(reference) {
  const payment = await paystackRequest(
    `/transaction/verify/${encodeURIComponent(reference)}`
  );

  console.log("PAYSTACK VERIFICATION:", {
    id: payment.id,
    reference: payment.reference,
    status: payment.status,
    amount: payment.amount,
    requested_amount: payment.requested_amount,
    currency: payment.currency,
    channel: payment.channel,
  });

  return payment;
}

// --------------------------------------------------
// VALIDATE VERIFIED PAYMENT
// --------------------------------------------------

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

  // Paystack bank-transfer fees can increase the
  // total amount. Validate the requested amount.
  const requestedAmount = Number(
    payment.requested_amount ?? payment.amount
  );

  if (requestedAmount !== PRICE_KOBO) {
    throw new Error(
      "Requested payment amount does not match ₦1,200."
    );
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
    payment.customer.email.toLowerCase() !==
      pending.email.toLowerCase()
  ) {
    throw new Error("Payment email mismatch.");
  }

  if (!payment.id) {
    throw new Error("Paystack transaction ID is missing.");
  }

  return true;
}

// --------------------------------------------------
// ACTIVATE VERIFIED SUBSCRIPTION
// --------------------------------------------------

async function activateVerifiedPayment(payment, pending) {
  validatePaystackPayment(payment, pending);

  const { data: activated, error } = await supabase.rpc(
    "activate_kent_stream_paystack_payment",
    {
      p_transaction_id: String(payment.id),
      p_user_id: pending.user_id,
      p_reference: pending.reference,
      p_amount: PRICE,
      p_currency: CURRENCY,
    }
  );

  if (error) {
    console.error("Subscription activation RPC error:", error);
    throw error;
  }

  if (activated !== true) {
    throw new Error("Subscription activation was not confirmed.");
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
    console.error("Pending payment update error:", updateError);
    throw updateError;
  }

  console.log("KENT STREAM SUBSCRIPTION ACTIVATED:", {
    user_id: pending.user_id,
    reference: pending.reference,
    transaction_id: payment.id,
  });

  return true;
}

// --------------------------------------------------
// HOME
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    name: "KENT STREAM API",
    payment_gateway: "Paystack",
    status: "running",
  });
});

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    payment_gateway: "Paystack",
  });
});

// --------------------------------------------------
// INTERNATIONAL DISPLAY PRICING
// Paystack still charges NGN.
// Foreign currency amounts are estimates only.
// --------------------------------------------------

const COUNTRY_CURRENCIES = {
  NG: "NGN",
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  GH: "GHS",
  ZA: "ZAR",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  IE: "EUR",
  PT: "EUR",
  BE: "EUR",
  AT: "EUR",
  FI: "EUR",
  GR: "EUR",
};

let exchangeRatesCache = null;
let exchangeRatesCacheTime = 0;

async function getExchangeRates() {
  const now = Date.now();

  if (
    exchangeRatesCache &&
    now - exchangeRatesCacheTime < 60 * 60 * 1000
  ) {
    return exchangeRatesCache;
  }

  const response = await fetch(
    "https://open.er-api.com/v6/latest/NGN"
  );

  if (!response.ok) {
    throw new Error("Unable to retrieve exchange rates.");
  }

  const result = await response.json();

  if (
    result.result !== "success" ||
    !result.rates
  ) {
    throw new Error("Invalid exchange-rate response.");
  }

  exchangeRatesCache = result.rates;
  exchangeRatesCacheTime = now;

  return exchangeRatesCache;
}

app.get("/api/pricing", async (req, res) => {
  try {
    const country = String(
      req.query.country || "NG"
    ).toUpperCase();

    const displayCurrency =
      COUNTRY_CURRENCIES[country] || "NGN";

    if (displayCurrency === "NGN") {
      return res.json({
        country,
        display_currency: "NGN",
        display_amount: PRICE,
        display_price: "₦1,200",
        charge_currency: "NGN",
        charge_amount: PRICE,
        estimated: false,
        notice: "You will be charged ₦1,200 through Paystack.",
      });
    }

    const rates = await getExchangeRates();
    const rate = Number(rates[displayCurrency]);

    if (!rate || !Number.isFinite(rate)) {
      throw new Error("Currency exchange rate unavailable.");
    }

    const amount = PRICE * rate;

    const formatted = new Intl.NumberFormat(
      "en",
      {
        style: "currency",
        currency: displayCurrency,
        maximumFractionDigits: 2,
      }
    ).format(amount);

    return res.json({
      country,
      display_currency: displayCurrency,
      display_amount: Number(amount.toFixed(2)),
      display_price: formatted,
      charge_currency: "NGN",
      charge_amount: PRICE,
      estimated: true,
      notice:
        `Estimated local price. Paystack will charge ₦1,200 in NGN. ` +
        `Your bank or card provider may apply its own exchange rate and fees.`,
    });
  } catch (error) {
    console.error("Pricing error:", error);

    return res.status(503).json({
      error: "Unable to load international pricing.",
    });
  }
});

// --------------------------------------------------
// PREPARE PAYSTACK PAYMENT
// --------------------------------------------------

app.post(
  "/api/paystack/prepare",
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

      const reference =
        `KENT-${user.id}-${crypto.randomUUID()}`;

      const { error: insertError } = await supabase
        .from("paystack_pending_payments")
        .insert({
          reference,
          user_id: user.id,
          email: user.email,
          amount: PRICE,
          currency: CURRENCY,
          status: "pending",
        });

      if (insertError) {
        console.error(
          "Pending payment creation error:",
          insertError
        );

        return res.status(500).json({
          error: "Unable to prepare payment.",
        });
      }

      const payment = await paystackRequest(
        "/transaction/initialize",
        {
          method: "POST",
          body: JSON.stringify({
            email: user.email,
            amount: PRICE_KOBO,
            currency: CURRENCY,
            reference,
            callback_url: CALLBACK_URL,
            metadata: {
              user_id: user.id,
              product: "KENT STREAM Monthly Subscription",
            },
          }),
        }
      );

      return res.json({
        status: "success",
        authorization_url: payment.authorization_url,
        access_code: payment.access_code,
        reference: payment.reference,
        amount: PRICE,
        currency: CURRENCY,
      });
    } catch (error) {
      console.error("Payment preparation error:", error);

      return res.status(500).json({
        error: "Payment preparation failed. Please try again.",
      });
    }
  }
);

// --------------------------------------------------
// VERIFY PAYSTACK PAYMENT
// --------------------------------------------------

app.post(
  "/api/paystack/verify",
  express.json(),
  async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);

      if (!user) {
        return res.status(401).json({
          error: "Please sign in first.",
        });
      }

      const reference = req.body?.reference;

      if (
        typeof reference !== "string" ||
        !reference.trim()
      ) {
        return res.status(400).json({
          error: "Payment reference is required.",
        });
      }

      const { data: pending, error: pendingError } =
        await supabase
          .from("paystack_pending_payments")
          .select("*")
          .eq("reference", reference)
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

      const payment = await verifyWithPaystack(reference);

      await activateVerifiedPayment(payment, pending);

      return res.json({
        status: "success",
        paid: true,
        message: "Subscription payment verified and activated.",
      });
    } catch (error) {
      console.error("Payment verification error:", error);

      return res.status(400).json({
        error:
          "Payment could not be verified. Please try again.",
      });
    }
  }
);

// --------------------------------------------------
// RECOVER SUCCESSFUL PAYMENTS
// --------------------------------------------------

app.post(
  "/api/paystack/recover",
  express.json(),
  async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);

      if (!user) {
        return res.status(401).json({
          error: "Please sign in first.",
        });
      }

      const { data: pendingPayments, error } =
        await supabase
          .from("paystack_pending_payments")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(10);

      if (error) {
        throw error;
      }

      let recovered = false;

      for (const pending of pendingPayments || []) {
        try {
          const payment = await verifyWithPaystack(
            pending.reference
          );

          if (payment.status === "success") {
            await activateVerifiedPayment(
              payment,
              pending
            );

            recovered = true;
            break;
          }
        } catch (verificationError) {
          console.error(
            "Payment recovery attempt failed:",
            verificationError.message
          );
        }
      }

      return res.json({
        status: "success",
        recovered,
        message: recovered
          ? "Your subscription payment has been recovered."
          : "No successful pending payment was found.",
      });
    } catch (error) {
      console.error("Payment recovery error:", error);

      return res.status(500).json({
        error: "Unable to recover payment right now.",
      });
    }
  }
);

// --------------------------------------------------
// PAYSTACK WEBHOOK
// Verify signature using the original raw request body.
// --------------------------------------------------

app.post(
  "/api/paystack/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["x-paystack-signature"];

      if (!signature || !process.env.PAYSTACK_SECRET_KEY) {
        return res.status(401).json({
          error: "Invalid webhook signature.",
        });
      }

      const expectedSignature = crypto
        .createHmac(
          "sha512",
          process.env.PAYSTACK_SECRET_KEY
        )
        .update(req.body)
        .digest("hex");

      const received = Buffer.from(String(signature), "hex");
      const expected = Buffer.from(expectedSignature, "hex");

      if (
        received.length !== expected.length ||
        !crypto.timingSafeEqual(received, expected)
      ) {
        return res.status(401).json({
          error: "Invalid webhook signature.",
        });
      }

      const event = JSON.parse(req.body.toString("utf8"));

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
        });
      }

      // Always verify the transaction directly with Paystack.
      const payment = await verifyWithPaystack(reference);

      const { data: pending, error } = await supabase
        .from("paystack_pending_payments")
        .select("*")
        .eq("reference", reference)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!pending) {
        console.error(
          "Webhook pending payment not found:",
          reference
        );

        return res.status(404).json({
          error: "Pending payment not found.",
        });
      }

      if (pending.status === "paid") {
        return res.status(200).json({
          received: true,
          activated: true,
        });
      }

      await activateVerifiedPayment(payment, pending);

      return res.status(200).json({
        received: true,
        activated: true,
      });
    } catch (error) {
      console.error("Paystack webhook error:", error);

      return res.status(500).json({
        error: "Webhook processing failed.",
      });
    }
  }
);

// --------------------------------------------------
// PAYSTACK CALLBACK PAGE
// --------------------------------------------------

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
        font-family:Arial,sans-serif;
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

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `KENT STREAM API running on port ${PORT}`
  );
  console.log("Payment gateway: Paystack");
});
