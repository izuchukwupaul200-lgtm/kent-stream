
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

// FLUTTERWAVE API REQUEST
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
    console.error("Flutterwave invalid response:", {
      httpStatus: response.status,
      response: responseText.slice(0, 300),
    });

    throw new Error("Flutterwave returned an invalid response.");
  }

  if (!response.ok || result.status !== "success" || !result.data) {
    console.error("Flutterwave verification API error:", {
      httpStatus: response.status,
      apiStatus: result.status,
      message: result.message,
    });

    throw new Error("Flutterwave transaction verification failed.");
  }

  return result.data;
}

// VERIFY BY REFERENCE
async function verifyByReference(txRef) {
  const url =
    "https://api.flutterwave.com/v3/transactions/verify_by_reference" +
    `?tx_ref=${encodeURIComponent(txRef)}`;

  return flutterwaveRequest(url);
}

// VERIFY BY TRANSACTION ID
async function verifyWithFlutterwave(transactionId) {
  const url =
    "https://api.flutterwave.com/v3/transactions/" +
    `${encodeURIComponent(transactionId)}/verify`;

  return flutterwaveRequest(url);
}

// VALIDATE VERIFIED PAYMENT
function validatePayment(payment, expectedTxRef) {
  if (!payment || payment.status !== "successful") {
    throw new Error("Transaction is not successful.");
  }

  if (payment.tx_ref !== expectedTxRef) {
    throw new Error("Transaction reference mismatch.");
  }

  if (payment.currency !== CURRENCY) {
    throw new Error("Payment currency mismatch.");
  }

  const amount = Number(payment.amount);

  if (!Number.isFinite(amount) || amount < PRICE) {
    throw new Error("Payment amount is below ₦1,200.");
  }

  if (!payment.id) {
    throw new Error("Flutterwave transaction ID is missing.");
  }

  return true;
}

// VALIDATE CUSTOMER
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
    throw new Error("Payment email does not match.");
  }
}

// ACTIVATE VERIFIED PAYMENT
async function activateVerifiedPayment(payment, pending) {
  validatePayment(payment, pending.tx_ref);

  const transactionId = String(payment.id);

  if (
    payment.meta?.user_id &&
    payment.meta.user_id !== pending.user_id
  ) {
    throw new Error("Payment user mismatch.");
  }

  const { data: activated, error: activationError } =
    await supabase.rpc("activate_kent_stream_payment", {
      p_transaction_id: transactionId,
      p_user_id: pending.user_id,
      p_tx_ref: pending.tx_ref,
      p_amount: Number(payment.amount),
      p_currency: payment.currency,
    });

  if (activationError) {
    console.error("SUPABASE ACTIVATION ERROR:", {
      message: activationError.message,
      code: activationError.code,
      details: activationError.details,
      hint: activationError.hint,
    });

    throw new Error("Supabase subscription activation failed.");
  }

  if (activated !== true) {
    throw new Error("Supabase did not confirm activation.");
  }

  const { error: updateError } = await supabase
    .from("flutterwave_pending_payments")
    .update({
      status: "paid",
      transaction_id: transactionId,
    })
    .eq("tx_ref", pending.tx_ref)
    .eq("user_id", pending.user_id);

  if (updateError) {
    console.error("PENDING PAYMENT UPDATE ERROR:", {
      message: updateError.message,
      code: updateError.code,
      details: updateError.details,
    });

    throw new Error("Could not update pending payment.");
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

// FIND PENDING PAYMENT
async function findPendingPayment(txRef, userId) {
  const { data, error } = await supabase
    .from("flutterwave_pending_payments")
    .select("*")
    .eq("tx_ref", txRef)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("PENDING PAYMENT LOOKUP ERROR:", error);
    throw new Error("Could not find pending payment.");
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

// PREPARE PAYMENT
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
        console.error("CREATE PENDING PAYMENT ERROR:", error);

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
      console.error("PAYMENT PREPARATION ERROR:", error);

      return res.status(500).json({
        error: "Payment preparation failed.",
      });
    }
  }
);

// VERIFY PAYMENT FROM APP
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
          message: "Payment already confirmed.",
        });
      }

      const payment = await verifyByReference(txRef);

      validatePayment(payment, txRef);
      validatePaymentCustomer(payment, user);

      await activateVerifiedPayment(payment, pending);

      return res.json({
        status: "success",
        paid: true,
        message: "Payment verified and subscription activated.",
      });
    } catch (error) {
      console.error("APP PAYMENT VERIFICATION ERROR:", error);

      return res.status(400).json({
        error: "Payment could not be verified. Please contact support.",
      });
    }
  }
);

// RECOVER EXISTING PAYMENTS
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
          const payment = await verifyByReference(pending.tx_ref);

          validatePayment(payment, pending.tx_ref);
          validatePaymentCustomer(payment, user);

          await activateVerifiedPayment(payment, pending);

          return res.json({
            status: "success",
            paid: true,
            message: "Your payment was recovered and activated.",
          });
        } catch (verificationError) {
          console.log("RECOVERY ATTEMPT:", {
            tx_ref: pending.tx_ref,
            reason: verificationError.message,
          });
        }
      }

      return res.json({
        status: "success",
        paid: false,
        message: "No successful payment was found.",
      });
    } catch (error) {
      console.error("PAYMENT RECOVERY ERROR:", error);

      return res.status(500).json({
        error: "Payment recovery could not be completed.",
      });
    }
  }
);

// CHECK FLUTTERWAVE WEBHOOK SIGNATURE
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
// Keep this route before any global JSON body parser.
app.post(
  "/api/flutterwave/webhook",
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req, res) => {
    try {
      const signature = req.headers["verif-hash"];

      if (!validWebhookSignature(signature)) {
        console.error("WEBHOOK ERROR: Invalid signature.");

        return res.status(401).json({
          received: false,
          error: "Invalid webhook signature.",
        });
      }

      if (!Buffer.isBuffer(req.body)) {
        console.error("WEBHOOK ERROR: Raw body is missing.");

        return res.status(400).json({
          received: false,
          error: "Invalid webhook body.",
        });
      }

      let event;

      try {
        event = JSON.parse(req.body.toString("utf8"));
      } catch {
        console.error("WEBHOOK ERROR: Invalid JSON.");

        return res.status(400).json({
          received: false,
          error: "Invalid JSON.",
        });
      }

      console.log("FLUTTERWAVE WEBHOOK RECEIVED:", {
        event: event?.event,
        type: event?.type,
      });

      // Ignore unrelated event types.
      const eventType = event?.event || event?.type;

      if (
        eventType &&
        eventType !== "charge.completed"
      ) {
        return res.status(200).json({
          received: true,
          ignored: true,
        });
      }

      const transactionId =
        event?.data?.id ||
        event?.data?.transaction_id;

      if (!transactionId) {
        console.error("WEBHOOK ERROR: Transaction ID missing.");

        return res.status(200).json({
          received: true,
          ignored: true,
          reason: "Transaction ID missing.",
        });
      }

      // Verify directly with Flutterwave.
      const payment = await verifyWithFlutterwave(
        String(transactionId)
      );

      if (!payment.tx_ref) {
        throw new Error("Verified transaction has no tx_ref.");
      }

      validatePayment(payment, payment.tx_ref);

      // Find the pending payment linked to this transaction.
      const { data: pending, error: lookupError } = await supabase
        .from("flutterwave_pending_payments")
        .select("*")
        .eq("tx_ref", payment.tx_ref)
        .maybeSingle();

      if (lookupError) {
        console.error("WEBHOOK SUPABASE LOOKUP ERROR:", {
          message: lookupError.message,
          code: lookupError.code,
          details: lookupError.details,
        });

        throw new Error("Could not look up pending payment.");
      }

      // No matching pending record: acknowledge the event so
      // Flutterwave does not retry forever. Recovery can still
      // be used after the pending record is corrected.
      if (!pending) {
        console.error("WEBHOOK: No matching pending payment:", {
          tx_ref: payment.tx_ref,
          transaction_id: payment.id,
        });

        return res.status(200).json({
          received: true,
          activated: false,
          reason: "No matching pending payment.",
        });
      }

      // If already paid, acknowledge duplicate webhook safely.
      if (
        pending.status === "paid" &&
        String(pending.transaction_id) === String(payment.id)
      ) {
        return res.status(200).json({
          received: true,
          activated: true,
          duplicate: true,
        });
      }

      await activateVerifiedPayment(payment, pending);

      console.log("FLUTTERWAVE WEBHOOK PROCESSED SUCCESSFULLY:", {
        transaction_id: payment.id,
        tx_ref: payment.tx_ref,
        user_id: pending.user_id,
      });

      return res.status(200).json({
        received: true,
        activated: true,
      });
    } catch (error) {
      console.error("WEBHOOK PROCESSING ERROR:", {
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

// FLUTTERWAVE RETURN PAGE
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
