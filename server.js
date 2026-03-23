require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const { all, get, initializeDatabase, run } = require("./database");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "luxor2026";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || `http://localhost:${PORT}`;
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";

const SERVICE_DETAILS = {
  "Massagem Relaxante Luxor": { duration: "60 min", price: 180 },
  "Massagem Terapeutica Premium": { duration: "75 min", price: 240 },
  "Pedras Quentes e Aromas": { duration: "90 min", price: 320 },
  "Drenagem Linfatica": { duration: "60 min", price: 210 },
  "Massagem Modeladora": { duration: "50 min", price: 190 },
  "Atendimento Personalizado": { duration: "Sob consulta", price: 260 },
};

const app = express();
const mercadopagoClient = MERCADO_PAGO_ACCESS_TOKEN
  ? new MercadoPagoConfig({ accessToken: MERCADO_PAGO_ACCESS_TOKEN })
  : null;

app.use(
  cors({
    origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN.split(",").map((item) => item.trim()),
  })
);
app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/health", async (request, response) => {
  response.json({
    ok: true,
    database: path.join(__dirname, "database.sqlite"),
    mercadoPagoConfigured: Boolean(MERCADO_PAGO_ACCESS_TOKEN),
  });
});

app.get("/api/settings", async (request, response, next) => {
  try {
    const settings = await loadSettings();
    response.json(settings);
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings", requireAdmin, async (request, response, next) => {
  try {
    const payload = sanitizeSettingsPayload(request.body || {});

    await run(
      `
        UPDATE settings
        SET business_whatsapp = ?, mercado_pago_checkout = ?, pix_key = ?, business_address = ?
        WHERE id = 1
      `,
      [
        payload.businessWhatsapp,
        payload.mercadoPagoCheckout,
        payload.pixKey,
        payload.businessAddress,
      ]
    );

    response.json(await loadSettings());
  } catch (error) {
    next(error);
  }
});

app.get("/api/appointments/availability", async (request, response, next) => {
  try {
    const rows = await all(
      `
        SELECT id, appointment_date, appointment_time, status
        FROM appointments
        WHERE status != 'cancelled'
        ORDER BY appointment_date ASC, appointment_time ASC
      `
    );

    response.json(rows.map(mapAppointmentAvailability));
  } catch (error) {
    next(error);
  }
});

app.get("/api/appointments", requireAdmin, async (request, response, next) => {
  try {
    const rows = await all(
      `
        SELECT *
        FROM appointments
        ORDER BY appointment_date DESC, appointment_time DESC, created_at DESC
      `
    );

    response.json(rows.map(mapAppointmentRow));
  } catch (error) {
    next(error);
  }
});

app.post("/api/appointments", async (request, response, next) => {
  try {
    const payload = sanitizeAppointmentPayload(request.body || {});

    if (!payload.customerName || !payload.customerPhone || !payload.massageType) {
      response.status(400).json({ message: "Dados obrigatorios ausentes." });
      return;
    }

    const existingAppointment = await get(
      `
        SELECT id
        FROM appointments
        WHERE appointment_date = ? AND appointment_time = ? AND status != 'cancelled'
      `,
      [payload.appointmentDate, payload.appointmentTime]
    );

    if (existingAppointment) {
      response.status(409).json({ message: "Este horario ja foi reservado." });
      return;
    }

    const appointmentId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const serviceInfo = SERVICE_DETAILS[payload.massageType] || {
      duration: "Sob consulta",
      price: 0,
    };
    let paymentUrl = "";
    let mercadoPagoPreferenceId = "";
    const settings = await loadSettings();

    if (payload.paymentMethod === "Mercado Pago") {
      const mercadoPagoCheckout = await createMercadoPagoPreference({
        appointmentId,
        payload,
        serviceInfo,
        settings,
      });

      paymentUrl = mercadoPagoCheckout.paymentUrl;
      mercadoPagoPreferenceId = mercadoPagoCheckout.preferenceId;
    }

    await run(
      `
        INSERT INTO appointments (
          id,
          customer_name,
          customer_phone,
          customer_email,
          massage_type,
          appointment_date,
          appointment_time,
          payment_method,
          service_region,
          customer_notes,
          status,
          payment_status,
          amount,
          duration,
          mercado_pago_preference_id,
          mercado_pago_payment_id,
          payment_url,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        appointmentId,
        payload.customerName,
        payload.customerPhone,
        payload.customerEmail,
        payload.massageType,
        payload.appointmentDate,
        payload.appointmentTime,
        payload.paymentMethod,
        payload.serviceRegion,
        payload.customerNotes,
        "confirmed",
        "pending",
        serviceInfo.price,
        serviceInfo.duration,
        mercadoPagoPreferenceId,
        "",
        paymentUrl || settings.mercadoPagoCheckout,
        createdAt,
      ]
    );

    const appointment = await get(`SELECT * FROM appointments WHERE id = ?`, [appointmentId]);
    response.status(201).json({
      appointment: mapAppointmentRow(appointment),
      checkoutUrl: paymentUrl || settings.mercadoPagoCheckout,
      mercadoPagoConfigured: Boolean(MERCADO_PAGO_ACCESS_TOKEN),
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/appointments/:id", requireAdmin, async (request, response, next) => {
  try {
    const appointmentId = request.params.id;
    const appointment = await get(`SELECT * FROM appointments WHERE id = ?`, [appointmentId]);

    if (!appointment) {
      response.status(404).json({ message: "Agendamento nao encontrado." });
      return;
    }

    const nextStatus = sanitizeStatus(request.body.status || appointment.status);
    const nextPaymentStatus = sanitizePaymentStatus(
      request.body.paymentStatus || appointment.payment_status
    );

    await run(
      `
        UPDATE appointments
        SET status = ?, payment_status = ?
        WHERE id = ?
      `,
      [nextStatus, nextPaymentStatus, appointmentId]
    );

    const updated = await get(`SELECT * FROM appointments WHERE id = ?`, [appointmentId]);
    response.json(mapAppointmentRow(updated));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/appointments/cancelled", requireAdmin, async (request, response, next) => {
  try {
    const result = await run(`DELETE FROM appointments WHERE status = 'cancelled'`);
    response.json({ removed: result.changes });
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments/mercadopago/webhook", async (request, response, next) => {
  try {
    if (!mercadopagoClient) {
      response.status(200).json({ received: true });
      return;
    }

    const paymentId =
      request.query["data.id"] ||
      request.body?.data?.id ||
      request.body?.id ||
      request.query.id;

    if (!paymentId) {
      response.status(200).json({ received: true });
      return;
    }

    const paymentClient = new Payment(mercadopagoClient);
    const paymentResponse = await paymentClient.get({ id: String(paymentId) });
    const payment = paymentResponse;
    const appointmentId = payment.external_reference;

    if (appointmentId) {
      await run(
        `
          UPDATE appointments
          SET payment_status = ?, mercado_pago_payment_id = ?
          WHERE id = ?
        `,
        [mapMercadoPagoStatus(payment.status), String(paymentId), appointmentId]
      );
    }

    response.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, request, response, next) => {
  console.error("[Luxor API] Unexpected error:", error);
  response.status(500).json({
    message: "Ocorreu um erro interno no servidor.",
  });
});

initializeDatabase()
  .then(() => {
    if (require.main === module) {
      app.listen(PORT, () => {
        console.log(`[Luxor API] Running at http://localhost:${PORT}`);
      });
    }
  })
  .catch((error) => {
    console.error("[Luxor API] Failed to initialize database", error);
    process.exit(1);
  });

function requireAdmin(request, response, next) {
  const requestPassword = request.header("x-admin-password");

  if (!requestPassword || requestPassword !== ADMIN_PASSWORD) {
    response.status(401).json({ message: "Acesso administrativo negado." });
    return;
  }

  next();
}

async function loadSettings() {
  const row = await get(`SELECT * FROM settings WHERE id = 1`);

  return {
    businessWhatsapp: row?.business_whatsapp || "5511999999999",
    mercadoPagoCheckout: row?.mercado_pago_checkout || "https://www.mercadopago.com.br/",
    pixKey: row?.pix_key || "",
    businessAddress: row?.business_address || "",
  };
}

function sanitizeAppointmentPayload(payload) {
  return {
    customerName: String(payload.customerName || "").trim(),
    customerPhone: String(payload.customerPhone || "").trim(),
    customerEmail: String(payload.customerEmail || "").trim(),
    massageType: String(payload.massageType || "").trim(),
    appointmentDate: String(payload.appointmentDate || "").trim(),
    appointmentTime: String(payload.appointmentTime || "").trim(),
    paymentMethod: String(payload.paymentMethod || "").trim(),
    serviceRegion: String(payload.serviceRegion || "").trim(),
    customerNotes: String(payload.customerNotes || "").trim(),
  };
}

function sanitizeSettingsPayload(payload) {
  return {
    businessWhatsapp: sanitizePhone(payload.businessWhatsapp),
    mercadoPagoCheckout:
      String(payload.mercadoPagoCheckout || "").trim() || "https://www.mercadopago.com.br/",
    pixKey: String(payload.pixKey || "").trim(),
    businessAddress: String(payload.businessAddress || "").trim(),
  };
}

function sanitizePhone(value) {
  return String(value || "5511999999999").replace(/\D/g, "");
}

function sanitizeStatus(status) {
  return ["confirmed", "cancelled"].includes(status) ? status : "confirmed";
}

function sanitizePaymentStatus(status) {
  return ["pending", "paid"].includes(status) ? status : "pending";
}

function mapAppointmentAvailability(row) {
  return {
    id: row.id,
    appointmentDate: row.appointment_date,
    appointmentTime: row.appointment_time,
    status: row.status,
  };
}

function mapAppointmentRow(row) {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    massageType: row.massage_type,
    appointmentDate: row.appointment_date,
    appointmentTime: row.appointment_time,
    paymentMethod: row.payment_method,
    serviceRegion: row.service_region,
    customerNotes: row.customer_notes,
    status: row.status,
    paymentStatus: row.payment_status,
    amount: row.amount,
    duration: row.duration,
    mercadoPagoPreferenceId: row.mercado_pago_preference_id,
    mercadoPagoPaymentId: row.mercado_pago_payment_id,
    paymentUrl: row.payment_url,
    createdAt: row.created_at,
  };
}

async function createMercadoPagoPreference({ appointmentId, payload, serviceInfo, settings }) {
  if (!mercadopagoClient) {
    return {
      paymentUrl: settings.mercadoPagoCheckout,
      preferenceId: "",
    };
  }

  const preferenceClient = new Preference(mercadopagoClient);
  const result = await preferenceClient.create({
    body: {
      items: [
        {
          title: payload.massageType,
          quantity: 1,
          unit_price: Number(serviceInfo.price),
          currency_id: "BRL",
        },
      ],
      external_reference: appointmentId,
      payer: {
        name: payload.customerName,
        email: payload.customerEmail || undefined,
      },
      notification_url: `${PUBLIC_SITE_URL}/api/payments/mercadopago/webhook`,
      back_urls: {
        success: `${PUBLIC_SITE_URL}/?payment=success`,
        failure: `${PUBLIC_SITE_URL}/?payment=failure`,
        pending: `${PUBLIC_SITE_URL}/?payment=pending`,
      },
      auto_return: "approved",
    },
  });

  return {
    paymentUrl: result.init_point || settings.mercadoPagoCheckout,
    preferenceId: result.id || "",
  };
}

function mapMercadoPagoStatus(status) {
  return ["approved", "authorized"].includes(status) ? "paid" : "pending";
}

module.exports = app;
