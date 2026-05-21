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
const PREPAYMENT_METHODS = new Set(["Pix", "Transferencia", "Cartao de Credito", "Cartao de Debito"]);
const allowedOrigins = parseAllowedOrigins(FRONTEND_ORIGIN);
const DEFAULT_BOUNDARY_OPTIONS = [
  "Atendimento exclusivamente profissional",
  "Nao realizo qualquer contato intimo",
  "Nao aceito pedidos inapropriados",
  "Sessao encerrada em caso de desrespeito",
  "Privacidade e respeito sao obrigatorios",
];

const DEFAULT_PROFESSIONALS = [];
const DEFAULT_TIME_SLOTS = ["09:00", "10:30", "13:30", "15:00", "16:30"];
const DEFAULT_PAYMENT_METHODS = ["Pix", "Transferencia", "Dinheiro no atendimento"];
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
        isLocalOrigin(origin) ||
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
    response.json(await loadSettings());
  } catch (error) {
    console.error("[Flow API] GET /api/settings failed:", error);
    next(error);
  }
});

app.put("/api/settings", requireAdmin, async (request, response, next) => {
  try {
    const payload = sanitizeSettingsPayload(request.body || {});
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
          blocked_dates_json = ?,
          professionals_json = ?
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
        JSON.stringify(payload.professionals),
      ]
    );

    response.json(await loadSettings());
  } catch (error) {
    next(error);
  }
});

app.get("/api/appointments/availability", async (request, response, next) => {
  try {
    const professionalId = String(request.query.professionalId || "").trim();
    const params = [];
    let sql = `
      SELECT id, professional_id, appointment_date, appointment_time, status
      FROM appointments
      WHERE status != 'cancelled'
    `;

    if (professionalId) {
      sql += ` AND professional_id = ?`;
      params.push(professionalId);
    }

    sql += ` ORDER BY appointment_date ASC, appointment_time ASC`;
    const rows = await all(sql, params);
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

app.get("/api/professional-applications", requireAdmin, async (request, response, next) => {
  try {
    const rows = await all(`
      SELECT *
      FROM professional_applications
      ORDER BY created_at DESC
    `);
    response.json(rows.map(mapProfessionalApplicationRow));
  } catch (error) {
    next(error);
  }
});

app.post("/api/professional-applications", async (request, response, next) => {
  try {
    const payload = sanitizeProfessionalApplicationPayload(request.body || {});

    if (!payload.fullName || !payload.whatsapp || !payload.acceptedTerms || !payload.acceptedFee) {
      response.status(400).json({
        message: "Preencha os dados obrigatorios e confirme o aceite das regras e da mensalidade.",
      });
      return;
    }

    const applicationId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await run(
      `
        INSERT INTO professional_applications (
          id,
          full_name,
          whatsapp,
          email,
          city,
          instagram,
          specialties,
          message,
          accepted_terms,
          accepted_fee,
          status,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        applicationId,
        payload.fullName,
        payload.whatsapp,
        payload.email,
        payload.city,
        payload.instagram,
        payload.specialties,
        payload.message,
        payload.acceptedTerms ? 1 : 0,
        payload.acceptedFee ? 1 : 0,
        "pending",
        createdAt,
      ]
    );

    const application = await get(`SELECT * FROM professional_applications WHERE id = ?`, [applicationId]);
    response.status(201).json({
      application: mapProfessionalApplicationRow(application),
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/professional-applications/:id", requireAdmin, async (request, response, next) => {
  try {
    const applicationId = request.params.id;
    const application = await get(`SELECT * FROM professional_applications WHERE id = ?`, [applicationId]);

    if (!application) {
      response.status(404).json({ message: "Solicitacao de cadastro nao encontrada." });
      return;
    }

    const nextStatus = sanitizeProfessionalApplicationStatus(request.body.status || application.status);

    await run(
      `
        UPDATE professional_applications
        SET status = ?
        WHERE id = ?
      `,
      [nextStatus, applicationId]
    );

    const updated = await get(`SELECT * FROM professional_applications WHERE id = ?`, [applicationId]);
    response.json(mapProfessionalApplicationRow(updated));
  } catch (error) {
    next(error);
  }
});

app.post("/api/appointments", async (request, response, next) => {
  try {
    const payload = sanitizeAppointmentPayload(request.body || {});
    const settings = await loadSettings();
    const professional = settings.professionals.find((item) => item.id === payload.professionalId);

    if (
      !payload.professionalId ||
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

    if (!professional) {
      response.status(400).json({ message: "Profissional invalida." });
      return;
    }

    const serviceMap = buildServiceMap(professional.services);
    const allowedTimeSlots = new Set(professional.timeSlots);
    const allowedPaymentMethods = new Set(professional.paymentMethods);
    const blockedDates = new Set(settings.blockedDates);

    if (!serviceMap[payload.massageType]) {
      response.status(400).json({ message: "Servico invalido para a profissional selecionada." });
      return;
    }

    if (!allowedTimeSlots.has(payload.appointmentTime)) {
      response.status(400).json({ message: "Horario invalido para esta profissional." });
      return;
    }

    if (!allowedPaymentMethods.has(payload.paymentMethod)) {
      response.status(400).json({ message: "Metodo de pagamento invalido para esta profissional." });
      return;
    }

    if (!isValidIsoDate(payload.appointmentDate)) {
      response.status(400).json({ message: "Data invalida." });
      return;
    }

    if (!isAllowedWeekday(payload.appointmentDate, professional.allowedWeekdays)) {
      response.status(400).json({ message: "A profissional nao atende no dia selecionado." });
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
        WHERE professional_id = ? AND appointment_date = ? AND appointment_time = ? AND status != 'cancelled'
      `,
      [professional.id, payload.appointmentDate, payload.appointmentTime]
    );

    if (existingAppointment) {
      response.status(409).json({ message: "Este horario ja foi reservado para a profissional selecionada." });
      return;
    }

    const appointmentId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const serviceInfo = serviceMap[payload.massageType];
    const requiresPrepayment = isPrepaymentMethod(payload.paymentMethod);
    const initialStatus = requiresPrepayment ? "pending_payment" : "confirmed";
    let paymentUrl = "";
    let mercadoPagoPreferenceId = "";

    if (requiresPrepayment && shouldUseMercadoPago(payload.paymentMethod)) {
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
          professional_id,
          professional_name,
          professional_whatsapp,
          professional_address,
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
          active_booking,
          payment_status,
          amount,
          duration,
          mercado_pago_preference_id,
          mercado_pago_payment_id,
          payment_url,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        appointmentId,
        professional.id,
        professional.name,
        professional.whatsapp,
        professional.address,
        payload.customerName,
        payload.customerPhone,
        payload.customerEmail,
        payload.massageType,
        payload.appointmentDate,
        payload.appointmentTime,
        payload.paymentMethod,
        payload.serviceRegion || professional.address,
        payload.customerNotes,
        initialStatus,
        1,
        "pending",
        safeAppointmentAmount(serviceInfo.price),
        serviceInfo.duration,
        mercadoPagoPreferenceId,
        "",
        paymentUrl,
        createdAt,
      ]
    );

    const appointment = await get(`SELECT * FROM appointments WHERE id = ?`, [appointmentId]);
    response.status(201).json({
      appointment: mapAppointmentRow(appointment),
      checkoutUrl: paymentUrl,
      mercadoPagoConfigured: Boolean(MERCADO_PAGO_ACCESS_TOKEN),
    });
  } catch (error) {
    if (isAppointmentSlotConflictError(error)) {
      response.status(409).json({ message: "Este horario ja foi reservado para a profissional selecionada." });
      return;
    }
    console.error("[Flow API] POST /api/appointments failed:", error && error.message, error && error.code);
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

    const nextPaymentStatus = sanitizePaymentStatus(
      request.body.paymentStatus || appointment.payment_status
    );
    const requestedStatus = request.body.status || appointment.status;
    let nextStatus = sanitizeStatus(requestedStatus);

    if (nextPaymentStatus === "paid" && appointment.status === "pending_payment" && requestedStatus !== "cancelled") {
      nextStatus = "confirmed";
    }

    await run(
      `
        UPDATE appointments
        SET status = ?, active_booking = ?, payment_status = ?
        WHERE id = ?
      `,
      [nextStatus, nextStatus === "cancelled" ? 0 : 1, nextPaymentStatus, appointmentId]
    );

    const updated = await get(`SELECT * FROM appointments WHERE id = ?`, [appointmentId]);
    response.json(mapAppointmentRow(updated));
  } catch (error) {
    if (isAppointmentSlotConflictError(error)) {
      response.status(409).json({ message: "Este horario ja foi reservado para a profissional selecionada." });
      return;
    }
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
      const paymentStatus = mapMercadoPagoStatus(payment.status);
      await run(
        `
          UPDATE appointments
          SET
            payment_status = ?,
            status = CASE WHEN ? = 'paid' THEN 'confirmed' ELSE status END,
            active_booking = CASE WHEN status = 'cancelled' THEN 0 ELSE active_booking END,
            mercado_pago_payment_id = ?
          WHERE id = ?
        `,
        [paymentStatus, paymentStatus, String(paymentId), appointmentId]
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
  const services = parseJsonArray(row?.services_json, []);
  const timeSlots = parseJsonArray(row?.time_slots_json, DEFAULT_TIME_SLOTS);
  const paymentMethods = parseJsonArray(row?.payment_methods_json, DEFAULT_PAYMENT_METHODS);
  const allowedWeekdays = parseJsonArray(row?.allowed_weekdays_json, DEFAULT_ALLOWED_WEEKDAYS);
  const blockedDates = parseJsonArray(row?.blocked_dates_json, []);
  const professionals = sanitizeProfessionals(
    parseJsonArray(row?.professionals_json, []),
    {
      services,
      timeSlots,
      paymentMethods,
      allowedWeekdays,
      businessWhatsapp: row?.business_whatsapp || "5511999999999",
      businessAddress: row?.business_address || "",
    }
  );

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
    professionals,
  };
}

function sanitizeAppointmentPayload(payload) {
  return {
    professionalId: String(payload.professionalId || "").trim().slice(0, 80),
    customerName: String(payload.customerName || "").trim().slice(0, 120),
    customerPhone: sanitizePhone(payload.customerPhone),
    customerEmail: String(payload.customerEmail || "").trim().slice(0, 160),
    massageType: String(payload.massageType || "").trim().slice(0, 120),
    appointmentDate: String(payload.appointmentDate || "").trim(),
    appointmentTime: String(payload.appointmentTime || "").trim(),
    paymentMethod: String(payload.paymentMethod || "").trim().slice(0, 60),
    serviceRegion: String(payload.serviceRegion || "").trim().slice(0, 160),
    customerNotes: String(payload.customerNotes || "").trim().slice(0, 500),
  };
}

function sanitizeProfessionalApplicationPayload(payload) {
  return {
    fullName: String(payload.fullName || "").trim().slice(0, 120),
    whatsapp: sanitizePhone(payload.whatsapp),
    email: String(payload.email || "").trim().slice(0, 160),
    city: String(payload.city || "").trim().slice(0, 120),
    instagram: String(payload.instagram || "").trim().slice(0, 120),
    specialties: String(payload.specialties || "").trim().slice(0, 300),
    message: String(payload.message || "").trim().slice(0, 1000),
    acceptedTerms: Boolean(payload.acceptedTerms),
    acceptedFee: Boolean(payload.acceptedFee),
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
    professionals: sanitizeProfessionals(payload.professionals, {
      services,
      timeSlots,
      paymentMethods,
      allowedWeekdays,
      businessWhatsapp: sanitizePhone(payload.businessWhatsapp),
      businessAddress: String(payload.businessAddress || "").trim(),
    }),
  };
}

function sanitizeProfessionals(value, fallbackContext = {}) {
  const professionals = Array.isArray(value) ? value : [];
  const normalized = professionals
    .map((item, index) => sanitizeProfessional(item, index, fallbackContext))
    .filter(Boolean);

  return normalized.length ? normalized : [];
}

function sanitizeProfessional(item, index, fallbackContext = {}) {
  const name = String(item?.name || "").trim().slice(0, 120);
  const role = String(item?.role || "Profissional").trim().slice(0, 120);
  const whatsapp = sanitizePhone(item?.whatsapp || fallbackContext.businessWhatsapp || "");
  const address = String(item?.address || fallbackContext.businessAddress || "").trim().slice(0, 180);
  const id = sanitizeProfessionalId(item?.id || name || `profissional-${index + 1}`);
  const services = sanitizeServices(item?.services || fallbackContext.services);
  const timeSlots = sanitizeTimeSlots(item?.timeSlots || fallbackContext.timeSlots);
  const paymentMethods = sanitizePaymentMethods(item?.paymentMethods || fallbackContext.paymentMethods);
  const allowedWeekdays = sanitizeAllowedWeekdays(item?.allowedWeekdays || fallbackContext.allowedWeekdays);

  if (!name || !whatsapp || !services.length || !timeSlots.length || !paymentMethods.length || !allowedWeekdays.length) {
    return null;
  }

  return {
    id,
    name,
    role,
    whatsapp,
    address,
    neighborhood: String(item?.neighborhood || "").trim().slice(0, 80),
    city: String(item?.city || "").trim().slice(0, 80),
    bio: String(item?.bio || "").trim().slice(0, 320),
    photo: String(item?.photo || "").trim().slice(0, 500),
    galleryPhotos: sanitizeMediaList(item?.galleryPhotos, 6, "image"),
    galleryVideos: sanitizeMediaList(item?.galleryVideos, 2, "video"),
    specialties: sanitizeSpecialties(item?.specialties),
    serviceDetails: String(item?.serviceDetails || "").trim().slice(0, 600),
    boundaries: sanitizeBoundaries(item?.boundaries),
    services,
    timeSlots,
    paymentMethods,
    allowedWeekdays,
  };
}

function sanitizeSpecialties(value) {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.map((item) => String(item || "").trim().slice(0, 50)).filter(Boolean))].slice(0, 8);
}

function sanitizeBoundaries(value) {
  const list = Array.isArray(value) ? value : [];
  const normalized = [...new Set(list.map((item) => String(item || "").trim().slice(0, 90)).filter(Boolean))].slice(0, 8);
  return normalized.length ? normalized : DEFAULT_BOUNDARY_OPTIONS;
}

function sanitizeMediaList(value, limit, type) {
  const list = Array.isArray(value) ? value : [];
  const normalized = [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))]
    .filter((item) => isLikelyMediaUrl(item, type))
    .slice(0, limit);
  return normalized;
}

function isLikelyMediaUrl(value, type) {
  if (!/^https?:\/\//i.test(String(value || "").trim())) {
    return false;
  }

  if (type === "video") {
    return /\.(mp4|webm|ogg)(\?.*)?$/i.test(value) || /youtube\.com|youtu\.be|vimeo\.com/i.test(value);
  }

  return true;
}

function sanitizeProfessionalId(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || "profissional";
}

function sanitizePhone(value) {
  return String(value || "5511999999999").replace(/\D/g, "");
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

  return normalized;
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

function isLocalOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(origin || "").trim());
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

function sanitizeStatus(status) {
  return ["pending_payment", "confirmed", "cancelled"].includes(status) ? status : "confirmed";
}

function sanitizePaymentStatus(status) {
  return ["pending", "paid"].includes(status) ? status : "pending";
}

function sanitizeProfessionalApplicationStatus(status) {
  return ["pending", "in_contact", "approved", "blocked"].includes(status) ? status : "pending";
}

function mapAppointmentAvailability(row) {
  return {
    id: row.id,
    professionalId: row.professional_id,
    appointmentDate: row.appointment_date,
    appointmentTime: row.appointment_time,
    status: row.status,
  };
}

function mapAppointmentRow(row) {
  return {
    id: row.id,
    professionalId: row.professional_id,
    professionalName: row.professional_name,
    professionalWhatsapp: row.professional_whatsapp,
    professionalAddress: row.professional_address,
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

function mapProfessionalApplicationRow(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    whatsapp: row.whatsapp,
    email: row.email,
    city: row.city,
    instagram: row.instagram,
    specialties: row.specialties,
    message: row.message,
    acceptedTerms: Boolean(row.accepted_terms),
    acceptedFee: Boolean(row.accepted_fee),
    status: row.status,
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

function isAppointmentSlotConflictError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "23505" || message.includes("appointments_unique_active_slot");
}

function isPrepaymentMethod(paymentMethod) {
  return PREPAYMENT_METHODS.has(String(paymentMethod || "").trim());
}

function shouldUseMercadoPago(paymentMethod) {
  return ["Cartao de Credito", "Cartao de Debito"].includes(String(paymentMethod || "").trim());
}

function safeAppointmentAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function buildMercadoPagoPaymentMethods(paymentMethod) {
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
