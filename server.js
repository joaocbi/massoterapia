require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const { all, get, initializeDatabase, run, isPostgresEnv } = require("./database-router");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "").trim();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || `http://localhost:${PORT}`;
const MERCADO_PAGO_ACCESS_TOKEN = normalizeMercadoPagoAccessToken(
  process.env.MERCADO_PAGO_ACCESS_TOKEN || ""
);
const PREPAYMENT_METHODS = new Set(["Pix", "Cartao de Credito", "Cartao de Debito"]);
const allowedOrigins = parseAllowedOrigins(FRONTEND_ORIGIN);

const DEFAULT_SERVICE_CATALOG = [
  { name: "Massagem Relaxante Flow", duration: "60 min", price: 180 },
  { name: "Massagem Terapeutica Premium", duration: "75 min", price: 240 },
  { name: "Tantrica Flow", duration: "90 min", price: 320 },
  { name: "Drenagem Linfatica", duration: "60 min", price: 210 },
  { name: "Massagem Modeladora", duration: "50 min", price: 190 },
  { name: "Atendimento Personalizado", duration: "Sob consulta", price: 260 },
];
const DEFAULT_TIME_SLOTS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];
const DEFAULT_PAYMENT_METHODS = ["Pix", "Cartao de Credito", "Cartao de Debito"];
const DEFAULT_ALLOWED_WEEKDAYS = [1, 2, 3, 4, 5, 6];

const app = express();
const mercadopagoClient = MERCADO_PAGO_ACCESS_TOKEN
  ? new MercadoPagoConfig({ accessToken: MERCADO_PAGO_ACCESS_TOKEN })
  : null;

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        isTrustedVercelOrigin(origin) ||
        isTrustedGithubPagesOrigin(origin)
      ) {
        callback(null, true);
        return;
      }

      console.warn("[Flow API] Blocked CORS origin:", origin);
      callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "HEAD", "PUT", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-admin-password"],
    optionsSuccessStatus: 204,
  })
);
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/health", async (request, response) => {
  response.json({
    ok: true,
    database: isPostgresEnv() ? "postgresql" : path.join(__dirname, "database.sqlite"),
    persistence: isPostgresEnv()
      ? "postgres"
      : process.env.VERCEL
        ? "sqlite-tmp-ephemeral"
        : "sqlite-file",
    adminConfigured: Boolean(ADMIN_PASSWORD),
    mercadoPagoConfigured: Boolean(MERCADO_PAGO_ACCESS_TOKEN),
  });
});

app.get("/api/settings", async (request, response, next) => {
  try {
    const settings = await loadSettings();
    response.json(settings);
  } catch (error) {
    console.error("[Flow API] GET /api/settings failed:", error);
    next(error);
  }
});

app.put("/api/settings", requireAdmin, async (request, response, next) => {
  try {
    const payload = sanitizeSettingsPayload(request.body || {});
    const supportsAdvancedSettings = await hasAdvancedSettingsColumns();

    if (supportsAdvancedSettings) {
      await run(
        `
          UPDATE settings
          SET
            business_whatsapp = ?,
            mercado_pago_checkout = ?,
            pix_key = ?,
            business_address = ?,
            services_json = ?,
            time_slots_json = ?,
            payment_methods_json = ?,
            allowed_weekdays_json = ?,
            blocked_dates_json = ?
          WHERE id = 1
        `,
        [
          payload.businessWhatsapp,
          payload.mercadoPagoCheckout,
          payload.pixKey,
          payload.businessAddress,
          JSON.stringify(payload.services),
          JSON.stringify(payload.timeSlots),
          JSON.stringify(payload.paymentMethods),
          JSON.stringify(payload.allowedWeekdays),
          JSON.stringify(payload.blockedDates),
        ]
      );
    } else {
      console.warn("[Flow API] Advanced settings columns not found. Using legacy settings update.");
      await run(
        `
          UPDATE settings
          SET
            business_whatsapp = ?,
            mercado_pago_checkout = ?,
            pix_key = ?,
            business_address = ?
          WHERE id = 1
        `,
        [payload.businessWhatsapp, payload.mercadoPagoCheckout, payload.pixKey, payload.businessAddress]
      );
    }

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
    const settings = await loadSettings();
    const serviceMap = buildServiceMap(settings.services);
    const allowedTimeSlots = new Set(settings.timeSlots);
    const allowedPaymentMethods = new Set(settings.paymentMethods);
    const blockedDates = new Set(settings.blockedDates);

    if (
      !payload.customerName ||
      !payload.customerPhone ||
      !payload.massageType ||
      !payload.appointmentDate ||
      !payload.appointmentTime ||
      !payload.paymentMethod
    ) {
      response.status(400).json({ message: "Dados obrigatorios ausentes." });
      return;
    }

    if (!serviceMap[payload.massageType]) {
      response.status(400).json({ message: "Tipo de massagem invalido." });
      return;
    }

    if (!allowedTimeSlots.has(payload.appointmentTime)) {
      response.status(400).json({ message: "Horario invalido." });
      return;
    }

    if (!allowedPaymentMethods.has(payload.paymentMethod)) {
      response.status(400).json({ message: "Metodo de pagamento invalido." });
      return;
    }

    if (!isValidIsoDate(payload.appointmentDate)) {
      response.status(400).json({ message: "Data invalida." });
      return;
    }

    if (!isAllowedWeekday(payload.appointmentDate, settings.allowedWeekdays)) {
      response.status(400).json({ message: "Agendamentos disponiveis apenas de segunda a sabado." });
      return;
    }

    if (blockedDates.has(payload.appointmentDate)) {
      response.status(400).json({ message: "Data indisponivel para atendimento." });
      return;
    }

    if (new Date(`${payload.appointmentDate}T00:00:00`) < startOfToday()) {
      response.status(400).json({ message: "Nao e permitido agendar datas passadas." });
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
    const serviceInfo = serviceMap[payload.massageType] || {
      duration: "Sob consulta",
      price: 0,
    };
    let paymentUrl = "";
    let mercadoPagoPreferenceId = "";

    if (isPrepaymentMethod(payload.paymentMethod) && payload.paymentMethod !== "Pix") {
      const mercadoPagoCheckout = await createMercadoPagoPreference({
        appointmentId,
        payload,
        serviceInfo,
        settings,
      });

      paymentUrl = mercadoPagoCheckout.paymentUrl;
      mercadoPagoPreferenceId = mercadoPagoCheckout.preferenceId;
    } else if (payload.paymentMethod === "Pix") {
      console.log(
        "[Flow API] Appointment uses Pix without Mercado Pago preference (manual Pix key / no checkout API)."
      );
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
        payload.paymentMethod === "Pix" ? paymentUrl || "" : paymentUrl || settings.mercadoPagoCheckout,
        createdAt,
      ]
    );

    const appointment = await get(`SELECT * FROM appointments WHERE id = ?`, [appointmentId]);
    response.status(201).json({
      appointment: mapAppointmentRow(appointment),
      checkoutUrl:
        payload.paymentMethod === "Pix" ? "" : paymentUrl || settings.mercadoPagoCheckout,
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
  console.error("[Flow API] Unexpected error:", error);
  const hint = sanitizeClientErrorHint(error && error.message);
  response.status(500).json({
    message: "Ocorreu um erro interno no servidor.",
    ...(error && error.code ? { code: String(error.code) } : {}),
    ...(hint ? { hint } : {}),
  });
});

initializeDatabase()
  .then(() => {
    if (require.main === module) {
      app.listen(PORT, () => {
        console.log(`[Flow API] Running at http://localhost:${PORT}`);
      });
    }
  })
  .catch((error) => {
    console.error("[Flow API] Failed to initialize database", error);
    process.exit(1);
  });

function requireAdmin(request, response, next) {
  if (!ADMIN_PASSWORD) {
    console.error("[Flow API] ADMIN_PASSWORD is not configured");
    response.status(503).json({ message: "Painel administrativo indisponivel." });
    return;
  }

  const requestPassword = request.header("x-admin-password");

  if (!requestPassword || requestPassword !== ADMIN_PASSWORD) {
    response.status(401).json({ message: "Acesso administrativo negado." });
    return;
  }

  next();
}

async function loadSettings() {
  const row = await get(`SELECT * FROM settings WHERE id = 1`);
  const services = parseJsonArray(row?.services_json, DEFAULT_SERVICE_CATALOG);
  const timeSlots = parseJsonArray(row?.time_slots_json, DEFAULT_TIME_SLOTS);
  const paymentMethods = parseJsonArray(row?.payment_methods_json, DEFAULT_PAYMENT_METHODS);
  const allowedWeekdays = parseJsonArray(row?.allowed_weekdays_json, DEFAULT_ALLOWED_WEEKDAYS);
  const blockedDates = parseJsonArray(row?.blocked_dates_json, []);

  return {
    businessWhatsapp: row?.business_whatsapp || "5511999999999",
    mercadoPagoCheckout: row?.mercado_pago_checkout || "https://www.mercadopago.com.br/",
    pixKey: row?.pix_key || "",
    businessAddress: row?.business_address || "",
    services: sanitizeServices(services),
    timeSlots: sanitizeTimeSlots(timeSlots),
    paymentMethods: sanitizePaymentMethods(paymentMethods),
    allowedWeekdays: sanitizeAllowedWeekdays(allowedWeekdays),
    blockedDates: sanitizeBlockedDates(blockedDates),
  };
}

function sanitizeAppointmentPayload(payload) {
  return {
    customerName: String(payload.customerName || "").trim().slice(0, 120),
    customerPhone: sanitizePhone(payload.customerPhone),
    customerEmail: String(payload.customerEmail || "").trim().slice(0, 160),
    massageType: String(payload.massageType || "").trim(),
    appointmentDate: String(payload.appointmentDate || "").trim(),
    appointmentTime: String(payload.appointmentTime || "").trim(),
    paymentMethod: String(payload.paymentMethod || "").trim(),
    serviceRegion: String(payload.serviceRegion || "").trim().slice(0, 160),
    customerNotes: String(payload.customerNotes || "").trim().slice(0, 500),
  };
}

function sanitizeSettingsPayload(payload) {
  const services = sanitizeServices(payload.services);
  const timeSlots = sanitizeTimeSlots(payload.timeSlots);
  const paymentMethods = sanitizePaymentMethods(payload.paymentMethods);
  const allowedWeekdays = sanitizeAllowedWeekdays(payload.allowedWeekdays);
  const blockedDates = sanitizeBlockedDates(payload.blockedDates);

  return {
    businessWhatsapp: sanitizePhone(payload.businessWhatsapp),
    mercadoPagoCheckout:
      String(payload.mercadoPagoCheckout || "").trim() || "https://www.mercadopago.com.br/",
    pixKey: String(payload.pixKey || "").trim(),
    businessAddress: String(payload.businessAddress || "").trim(),
    services,
    timeSlots,
    paymentMethods,
    allowedWeekdays,
    blockedDates,
  };
}

function sanitizePhone(value) {
  return String(value || "5511999999999").replace(/\D/g, "");
}

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function parseAllowedOrigins(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isTrustedVercelOrigin(origin) {
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(String(origin || "").trim());
}

function isTrustedGithubPagesOrigin(origin) {
  return /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(String(origin || "").trim());
}

function isAllowedWeekday(dateString, allowedWeekdays) {
  const date = new Date(`${dateString}T00:00:00`);
  return allowedWeekdays.includes(date.getDay());
}

function parseJsonArray(value, fallback) {
  try {
    if (value == null || value === "") {
      return fallback;
    }

    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === "object") {
      return fallback;
    }

    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function sanitizeServices(value) {
  const services = Array.isArray(value) ? value : [];
  const normalized = services
    .map((service) => ({
      name: String(service?.name || "").trim().slice(0, 120),
      duration: String(service?.duration || "").trim().slice(0, 40),
      price: Number(service?.price || 0),
    }))
    .filter((service) => service.name && service.duration && Number.isFinite(service.price) && service.price >= 0);

  return normalized.length ? normalized : DEFAULT_SERVICE_CATALOG;
}

function sanitizeTimeSlots(value) {
  const slots = Array.isArray(value) ? value : [];
  const unique = [...new Set(slots.map((item) => String(item || "").trim()))];
  const filtered = unique.filter((slot) => /^\d{2}:\d{2}$/.test(slot));
  return filtered.length ? filtered : DEFAULT_TIME_SLOTS;
}

function sanitizePaymentMethods(value) {
  const methods = Array.isArray(value) ? value : [];
  const unique = [...new Set(methods.map((item) => String(item || "").trim().slice(0, 60)).filter(Boolean))];
  return unique.length ? unique : DEFAULT_PAYMENT_METHODS;
}

function sanitizeAllowedWeekdays(value) {
  const weekdays = Array.isArray(value)
    ? value.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  const unique = [...new Set(weekdays)];
  return unique.length ? unique : DEFAULT_ALLOWED_WEEKDAYS;
}

function sanitizeBlockedDates(value) {
  const dates = Array.isArray(value) ? value : [];
  const unique = [...new Set(dates.map((item) => String(item || "").trim()))];
  return unique.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
}

function buildServiceMap(services) {
  const map = {};

  services.forEach((service) => {
    map[service.name] = {
      duration: service.duration,
      price: Number(service.price),
    };
  });

  return map;
}

async function hasAdvancedSettingsColumns() {
  if (isPostgresEnv()) {
    return true;
  }

  const columns = await all(`PRAGMA table_info(settings)`);
  const names = new Set(columns.map((column) => column.name));

  return (
    names.has("services_json") &&
    names.has("time_slots_json") &&
    names.has("payment_methods_json") &&
    names.has("allowed_weekdays_json") &&
    names.has("blocked_dates_json")
  );
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
      payment_methods: buildMercadoPagoPaymentMethods(payload.paymentMethod),
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

function isPrepaymentMethod(paymentMethod) {
  return PREPAYMENT_METHODS.has(paymentMethod);
}

function buildMercadoPagoPaymentMethods(paymentMethod) {
  if (paymentMethod === "Pix") {
    return {
      excluded_payment_types: [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }],
      installments: 1,
    };
  }

  if (paymentMethod === "Cartao de Credito") {
    return {
      excluded_payment_types: [{ id: "debit_card" }, { id: "ticket" }, { id: "bank_transfer" }],
    };
  }

  if (paymentMethod === "Cartao de Debito") {
    return {
      excluded_payment_types: [{ id: "credit_card" }, { id: "ticket" }, { id: "bank_transfer" }],
      installments: 1,
    };
  }

  return undefined;
}

/**
 * Mercado Pago tokens must be a single line; pasted secrets often include \r\n and break the Authorization header.
 */
function normalizeMercadoPagoAccessToken(raw) {
  if (raw == null) {
    return "";
  }
  let token = String(raw)
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^Bearer\s+/i, "");
  const hadBreaks = /[\r\n\t]/.test(token);
  token = token.replace(/[\r\n\t]/g, "").trim();
  if (hadBreaks && token.length > 0) {
    console.warn(
      "[Flow API] MERCADO_PAGO_ACCESS_TOKEN had line breaks or tabs; removed. Re-save the secret in Vercel / .env as one line if issues persist."
    );
  }
  return token;
}

/** Never send API secrets to the browser in error hints. */
function sanitizeClientErrorHint(message) {
  if (!message || typeof message !== "string") {
    return "";
  }
  let hint = message.slice(0, 280);
  hint = hint.replace(/Bearer\s+APP_USR-[A-Za-z0-9\-_]+/gi, "Bearer [redacted]");
  hint = hint.replace(/APP_USR-[A-Za-z0-9\-_]+/g, "[redacted]");
  return hint.trim();
}

module.exports = app;
