
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

// AUTHENTICATE KENT STREAM USER
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

// COMMON FLUTTERWAVE API REQUEST
async function flutterwaveRequest(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
      Accept: "application/json",
    },
  });

  const responseText = await response.text();

  let result;

  try {
    result = JSON.parse(responseText);
  } catch {
    console.error("Flutterwave returned invalid JSON:", {
      httpStatus: response.status,
      response: responseText.slice(0, 500),
    });

    throw new Error("Invalid Flutterwave API response.");
  }

  if (!response.ok || result.status !== "success" || !result.data) {
    console.error("Flutterwave API request failed:", {
      httpStatus: response.status,
      apiStatus: result.status,
      message: result.message,
    });

    throw new Error("Flutterwave transaction verification failed.");
  }

  return result.data;
}

// VERIFY USING MERCHANT TRANSACTION REFERENCE
async function verifyByReference(txRef) {
  const url =
    "https://api.flutterwave.com/v3/transactions/verify_by_reference" +
    `?tx_ref=${encodeURIComponent(txRef)}`;

  return await flutterwaveRequest(url);
}

// VERIFY USING FLUTTERWAVE TRANSACTION ID
async function verifyWithFlutterwave(transactionId) {
  const url =
    "https://api.flutterwave.com/v3/transactions/" +
    `${encodeURIComponent(transactionId)}/verify`;

  return await flutterwaveRequest(url);
}

// VALIDATE PAYMENT AGAINST THE NIGERIAN SUBSCRIPTION PRICE
function validatePayment(payment, expectedTxRef) {
  if (!payment || payment.status !== "successful") {
    throw new Error("Transaction is not successful.");
  }

  if (payment.tx_ref !== expectedTxRef) {
    throw new Error("Transaction reference does not match.");
  }

  if (payment.currency !== CURRENCY) {
    throw new Error("Payment currency does not match.");
  }

  const paidAmount = Number(payment.amount);

  if (!Number.isFinite(paidAmount) || paidAmount < PRICE) {
    throw new Error("Payment amount is below the subscription price.");
  }

  if (!payment.id) {
    throw new Error("Flutterwave transaction ID is missing.");
  }

  return true;
}

// CHECK PAYMENT CUSTOMER DETAILS
function validatePaymentCustomer(payment, user) {
  if (
    payment.meta?.user_id &&
    payment.meta.user_id !== user.id
  ) {
    throw new Error("Payment user does not match.");
  }

  if (
    payment.customer?.email &&
    user.email &&
    payment.customer.email.toLowerCase() !==
      user.email.toLowerCase()
  ) {
    throw new Error("Payment customer email does not match.");
  }
}

// SAVE VERIFIED PAYMENT AND ACTIVATE SUBSCRIPTION
async function activateVerifiedPayment(payment, pending) {
  validatePayment(payment, pending.tx_ref);

  const transactionId = String(payment.id);

  if (
    payment.meta?.user_id &&
    payment.meta.user_id !== pending.user_id
  ) {
    throw new Error("Payment user mismatch.");
  }

  // Record the actual verified transaction amount and currency.
  // The RPC safely handles duplicate transaction IDs.
  const { data: activated, error: activationError } =
    await supabase.rpc("activate_kent_stream_payment", {
      p_transaction_id: transactionId,
      p_user_id: pending.user_id,
      p_tx_ref: pending.tx_ref,
      p_amount: Number(payment.amount),
      p_currency: payment.currency,
    });

  if (activationError) {
    console.error("Supabase activation error:", activationError);
    throw activationError;
  }

  if (activated !== true) {
    throw new Error("Supabase did not confirm subscription activation.");
  }

  // Mark this pending payment as paid.
  const { error: updateError } = await supabase
    .from("flutterwave_pending_payments")
    .update({
      status: "paid",
      transaction_id: transactionId,
    })
    .eq("tx_ref", pending.tx_ref)
    .eq("user_id", pending.user_id);

  if (updateError) {
    console.error("Pending payment update error:", updateError);
    throw updateError;
  }

  console.log("KENT STREAM PAYMENT ACTIVATED:", {
    user_id: pending.user_id,
    tx_ref: pending.tx_ref,
    transaction_id: transactionId,
    amount: payment.amount,
    currency: payment.currency,
  });

  return true;
}

// FIND A USER'S PENDING PAYMENT
async function findPendingPayment(txRef, userId) {
  const { data, error } = await supabase
    .from("flutterwave_pending_payments")
    .select("*")
    .eq("tx_ref", txRef)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
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

// PREPARE NEW PAYMENT
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

      if (typeof txRef !== "string" || !txRef.trim()) {
        return res.status(400).json({
          error: "Transaction reference is required.",
        });
      }

      const pending = await findPendingPayment(txRef, user.id);

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

      console.log("Verifying payment by reference:", {
        tx_ref: txRef,
        user_id: user.id,
      });

      const payment = await verifyByReference(txRef);

      validatePayment(payment, txRef);
      validatePaymentCustomer(payment, user);

      await activateVerifiedPayment(payment, pending);

      return res.json({
        status: "success",
        paid: true,
        message: "Subscription payment verified and activated.",
      });
    } catch (error) {
      console.error("Payment verification error:", error);

      return res.status(400).json({
        error: "Payment could not be verified. Please contact support.",
      });
    }
  }
);

// RECOVER EXISTING SUCCESSFUL PAYMENTS
app.post(
  "/api/flutterwave/recover",
  express.json(),
  async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);

      if (!user) {
        return res.status(401).json({
          error: "Please sign in first.",
        });
      }

      const { data: pendingPayments, error } = await supabase
        .from("flutterwave_pending_payments")
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
          message: "No pending payments were found.",
        });
      }

      for (const pending of pendingPayments) {
        try {
          console.log("Recovering existing payment:", {
            tx_ref: pending.tx_ref,
            user_id: user.id,
          });

          const payment = await verifyByReference(pending.tx_ref);

          validatePayment(payment, pending.tx_ref);
          validatePaymentCustomer(payment, user);

          await activateVerifiedPayment(payment, pending);

          console.log("PAYMENT RECOVERY SUCCESSFUL:", {
            user_id: user.id,
            tx_ref: pending.tx_ref,
            transaction_id: payment.id,
          });

          return res.json({
            status: "success",
            paid: true,
            message:
              "Your payment was recovered and your subscription activated.",
          });
        } catch (verificationError) {
          console.log("Pending payment not recovered:", {
            tx_ref: pending.tx_ref,
            reason: verificationError.message,
          });
        }
      }

      return res.json({
        status: "success",
        paid: false,
        message:
          "No successful payment was found among your pending references.",
      });
    } catch (error) {
      console.error("Payment recovery error:", error);

      return res.status(500).json({
        error: "Payment recovery could not be completed.",
      });
    }
  }
);

// COMPARE WEBHOOK SIGNATURE SAFELY
function validWebhookSignature(signature) {
  const configuredHash = process.env.FLW_WEBHOOK_HASH;

  if (
    typeof signature !== "string" ||
    typeof configuredHash !== "string" ||
    !signature ||
    !configuredHash
  ) {
    return false;
  }

  const received = Buffer.from(signature);
  const expected = Buffer.from(configuredHash);

  if (received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(received, expected);
}

// FLUTTERWAVE WEBHOOK
app.post(
  "/api/flutterwave/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["verif-hash"];

      if (!validWebhookSignature(signature)) {
        console.error("Invalid Flutterwave webhook signature.");

        return res.status(401).json({
          error: "Invalid webhook signature.",
        });
      }

      if (!Buffer.isBuffer(req.body)) {
        console.error("Webhook body was not received as raw JSON.");

        return res.status(400).json({
          error: "Invalid webhook body.",
        });
      }

      const event = JSON.parse(req.body.toString("utf8"));
      const transactionId = event?.data?.id;

      if (!transactionId) {
        console.log("Webhook received without a transaction ID.");

        return res.status(200).json({
          received: true,
          ignored: true,
        });
      }

      // Never trust the webhook payload alone.
      // Verify the transaction directly with Flutterwave.
      const payment = await verifyWithFlutterwave(
        String(transactionId)
      );

      if (!payment.tx_ref) {
        throw new Error("Verified payment has no transaction reference.");
      }

      validatePayment(payment, payment.tx_ref);

      const { data: pending, error } = await supabase
        .from("flutterwave_pending_payments")
        .select("*")
        .eq("tx_ref", payment.tx_ref)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!pending) {
        console.error("Webhook pending payment not found:", {
          tx_ref: payment.tx_ref,
        });

        return res.status(404).json({
          error: "Pending payment not found.",
        });
      }

      await activateVerifiedPayment(payment, pending);

      console.log("FLUTTERWAVE WEBHOOK PROCESSED:", {
        transaction_id: payment.id,
        tx_ref: payment.tx_ref,
        user_id: pending.user_id,
      });

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
