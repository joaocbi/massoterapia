const APP_CONFIG = window.LUXOR_CONFIG || {};
/** Used when the static site is on GitHub Pages and apiBaseUrl is not set in site-config.js */
const FALLBACK_API_BASE = "https://flowterapia.vercel.app";
const ADMIN_ALERT_WHATSAPP = "5542991628586";
const PREPAYMENT_METHODS = new Set(["Pix", "Cartao de Credito", "Cartao de Debito"]);
const DEFAULT_SETTINGS = {
  businessWhatsapp: "5511999999999",
  mercadoPagoCheckout: "https://www.mercadopago.com.br/",
  pixKey: "",
  businessAddress: "",
  services: [
    { name: "Massagem Relaxante Flow", duration: "60 min", price: 180 },
    { name: "Massagem Terapeutica Premium", duration: "75 min", price: 240 },
    { name: "Tantrica Flow", duration: "90 min", price: 320 },
    { name: "Drenagem Linfatica", duration: "60 min", price: 210 },
    { name: "Massagem Modeladora", duration: "50 min", price: 190 },
    { name: "Atendimento Personalizado", duration: "Sob consulta", price: 260 },
  ],
  timeSlots: ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
  paymentMethods: ["Pix", "Cartao de Credito", "Cartao de Debito"],
  allowedWeekdays: [1, 2, 3, 4, 5, 6],
  blockedDates: [],
};

const state = {
  adminPassword: "",
  appointments: [],
  availability: [],
  settings: { ...DEFAULT_SETTINGS },
  filters: {
    search: "",
    status: "all",
    paymentStatus: "all",
  },
};

const bookingForm = document.getElementById("bookingForm");
const massageTypeField = document.getElementById("massageType");
const dateField = document.getElementById("appointmentDate");
const timeField = document.getElementById("appointmentTime");
const paymentMethodField = document.getElementById("paymentMethod");
const confirmationCard = document.getElementById("confirmationCard");
const confirmationTitle = document.getElementById("confirmationTitle");
const confirmationText = document.getElementById("confirmationText");
const confirmationWhatsappLink = document.getElementById("confirmationWhatsappLink");
const mercadoPagoLink = document.getElementById("mercadoPagoLink");
const appointmentsList = document.getElementById("appointmentsList");
const adminStats = document.getElementById("adminStats");
const adminModal = document.getElementById("adminModal");
const adminLogin = document.getElementById("adminLogin");
const adminContent = document.getElementById("adminContent");
const adminPasswordField = document.getElementById("adminPassword");
const businessWhatsappField = document.getElementById("businessWhatsapp");
const mercadoPagoCheckoutField = document.getElementById("mercadoPagoCheckout");
const pixKeyField = document.getElementById("pixKey");
const businessAddressField = document.getElementById("businessAddress");
const servicesCatalogField = document.getElementById("servicesCatalog");
const timeSlotsConfigField = document.getElementById("timeSlotsConfig");
const paymentMethodsConfigField = document.getElementById("paymentMethodsConfig");
const allowedWeekdaysConfigField = document.getElementById("allowedWeekdaysConfig");
const blockedDatesConfigField = document.getElementById("blockedDatesConfig");
const appointmentSearchField = document.getElementById("appointmentSearch");
const appointmentStatusFilterField = document.getElementById("appointmentStatusFilter");
const paymentStatusFilterField = document.getElementById("paymentStatusFilter");
const serviceRegionField = document.getElementById("serviceRegion");
const summaryService = document.getElementById("summaryService");
const summaryDuration = document.getElementById("summaryDuration");
const summaryPrice = document.getElementById("summaryPrice");
const summaryPayment = document.getElementById("summaryPayment");
const summaryRegion = document.getElementById("summaryRegion");
const summaryDateTime = document.getElementById("summaryDateTime");

console.log("[Flow] Site initialized");
console.log("[Flow] App config:", APP_CONFIG);

init().catch((error) => {
  console.error("[Flow] Failed to initialize application", error);
  const detail = error && error.message ? String(error.message) : String(error || "");
  window.alert(
    "Nao foi possivel inicializar o sistema. Verifique a API e site-config.js (apiBaseUrl).\n" +
      (detail ? `Detalhe: ${detail}` : "")
  );
});

async function init() {
  setMinimumDate();
  bindEvents();
  await loadPublicData();
  hydrateSettingsFields();
  updateBookingSummary();
}

function bindEvents() {
  bookingForm.addEventListener("submit", handleBookingSubmit);
  dateField.addEventListener("change", enforceBusinessDaySelection);
  dateField.addEventListener("change", renderTimeOptions);
  dateField.addEventListener("change", updateBookingSummary);
  timeField.addEventListener("change", updateBookingSummary);
  massageTypeField.addEventListener("change", updateBookingSummary);
  paymentMethodField.addEventListener("change", updateBookingSummary);
  serviceRegionField.addEventListener("input", updateBookingSummary);

  document.querySelectorAll(".service-select-button").forEach((button) => {
    button.addEventListener("click", () => {
      selectServiceAndScroll(button.dataset.service || "");
    });
  });

  document.querySelectorAll("[data-service-card]").forEach((card) => {
    card.addEventListener("click", () => {
      selectServiceAndScroll(card.dataset.serviceCard || "");
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectServiceAndScroll(card.dataset.serviceCard || "");
      }
    });
  });

  document.getElementById("openAdminModal").addEventListener("click", openAdminModal);
  document.getElementById("closeAdminModal").addEventListener("click", closeAdminModal);
  document.getElementById("adminLoginButton").addEventListener("click", handleAdminLogin);
  document.getElementById("saveSettingsButton").addEventListener("click", saveSettings);
  document.getElementById("clearCompletedButton").addEventListener("click", clearCancelledAppointments);
  document.getElementById("exportAppointmentsButton").addEventListener("click", exportAppointments);
  document.getElementById("exportServedClientsButton").addEventListener("click", exportServedClients);
  appointmentSearchField.addEventListener("input", handleFiltersChange);
  appointmentStatusFilterField.addEventListener("change", handleFiltersChange);
  paymentStatusFilterField.addEventListener("change", handleFiltersChange);
  adminModal.addEventListener("click", (event) => {
    if (event.target === adminModal) {
      closeAdminModal();
    }
  });
}

function getRadioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : "";
}

function selectServiceAndScroll(selectedService) {
  if (!selectedService) {
    return;
  }

  const radio = massageTypeField.querySelector(`input[value="${selectedService}"]`);
  if (radio) {
    radio.checked = true;
  }
  updateBookingSummary();
  document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
  console.log("[Flow] Service pre-selected:", selectedService);
}

async function handleBookingSubmit(event) {
  event.preventDefault();

  const formData = new FormData(bookingForm);
  const bookingPayload = {
    customerName: formData.get("customerName")?.toString().trim(),
    customerPhone: formData.get("customerPhone")?.toString().trim(),
    customerEmail: formData.get("customerEmail")?.toString().trim(),
    massageType: formData.get("massageType")?.toString().trim(),
    appointmentDate: formData.get("appointmentDate")?.toString().trim(),
    appointmentTime: formData.get("appointmentTime")?.toString().trim(),
    paymentMethod: formData.get("paymentMethod")?.toString().trim(),
    serviceRegion: formData.get("serviceRegion")?.toString().trim(),
    customerNotes: formData.get("customerNotes")?.toString().trim(),
  };

  console.log("[Flow] Booking submit payload:", bookingPayload);

  if (!isDateSelectable(bookingPayload.appointmentDate)) {
    window.alert("A data selecionada nao esta disponivel para atendimento.");
    console.warn("[Flow] Unavailable booking date blocked", bookingPayload.appointmentDate);
    return;
  }

  try {
    const result = await apiRequest("/api/appointments", {
      method: "POST",
      body: bookingPayload,
    });

    await loadPublicData();
    if (state.adminPassword) {
      await loadAdminAppointments();
      renderAdminStats();
      renderAppointments();
    }

    showConfirmation(result.appointment, result.checkoutUrl);
    bookingForm.reset();
    setMinimumDate();
    updateBookingSummary();
  } catch (error) {
    console.error("[Flow] Failed to create booking", error);
    window.alert(error.message || "Nao foi possivel concluir o agendamento.");
  }
}

function showConfirmation(appointment, checkoutUrl) {
  const readableDate = formatDate(appointment.appointmentDate);
  const message = buildWhatsappMessage(appointment);

  confirmationTitle.textContent = `${appointment.customerName}, seu horario foi confirmado.`;
  confirmationText.textContent =
    `${appointment.massageType} agendada para ${readableDate} as ${appointment.appointmentTime}. ` +
    `Pagamento escolhido: ${appointment.paymentMethod}. Valor: ${formatCurrency(appointment.amount)}.`;

  if (isPrepaymentMethod(appointment.paymentMethod)) {
    confirmationText.textContent +=
      " Pagamento antecipado obrigatorio. Envie o comprovante para confirmar definitivamente a reserva.";
  }

  if (appointment.paymentMethod === "Pix" && state.settings.pixKey) {
    confirmationText.textContent += ` Chave Pix para pagamento: ${state.settings.pixKey}.`;
  }

  if (appointment.serviceRegion) {
    confirmationText.textContent += ` Local: ${appointment.serviceRegion}.`;
  }

  confirmationWhatsappLink.href = buildWhatsappUrl(state.settings.businessWhatsapp, message);
  confirmationCard.classList.remove("hidden");
  confirmationCard.scrollIntoView({ behavior: "smooth", block: "center" });

  if (isPrepaymentMethod(appointment.paymentMethod) && checkoutUrl) {
    mercadoPagoLink.classList.remove("hidden");
    mercadoPagoLink.href = checkoutUrl;
    mercadoPagoLink.textContent = "Pagar agora (Mercado Pago)";
  } else {
    mercadoPagoLink.classList.add("hidden");
    mercadoPagoLink.href = "#";
  }

  if (isPrepaymentMethod(appointment.paymentMethod)) {
    notifyAdminPrepayment(appointment);
  }

  console.log("[Flow] Confirmation displayed for booking:", appointment.id);
}

function renderTimeOptions() {
  const selectedDate = dateField.value;

  if (selectedDate && !isDateSelectable(selectedDate)) {
    timeField.innerHTML = '<div class="field-note">Selecione uma data valida</div>';
    console.warn("[Flow] Invalid booking day selected:", selectedDate);
    return;
  }

  const occupiedTimes = new Set(
    getAvailabilityArray()
      .filter((item) => item.appointmentDate === selectedDate && item.status !== "cancelled")
      .map((item) => item.appointmentTime)
  );

  const previousValue = getRadioValue("appointmentTime");
  timeField.innerHTML = '';

  state.settings.timeSlots.forEach((time) => {
    const isBooked = occupiedTimes.has(time);
    const label = document.createElement("label");
    label.className = "radio-card";

    label.innerHTML = `
      <input type="radio" name="appointmentTime" value="${time}" required ${isBooked ? "disabled" : ""}>
      <div class="radio-card-content">${time}</div>
    `;
    timeField.appendChild(label);
  });

  if (previousValue && !occupiedTimes.has(previousValue)) {
    const radio = timeField.querySelector(`input[value="${previousValue}"]`);
    if (radio) radio.checked = true;
  }

  console.log("[Flow] Time options rendered for date:", selectedDate, "occupied:", [...occupiedTimes]);
}

function renderAppointments() {
  appointmentsList.innerHTML = "";
  const filteredAppointments = getFilteredAppointments();

  if (filteredAppointments.length === 0) {
    appointmentsList.innerHTML =
      '<div class="appointment-item"><div class="appointment-item-copy"><h5>Nenhum agendamento encontrado</h5><p>Ajuste os filtros ou aguarde novas reservas.</p></div></div>';
    return;
  }

  filteredAppointments.forEach((appointment) => {
    const item = document.createElement("article");
    item.className = "appointment-item";

    const statusClass = getStatusClassName(appointment.status);
    const paymentStatusClass = getPaymentStatusClassName(appointment.paymentStatus);
    const paymentStatusLabel = getPaymentStatusLabel(appointment.paymentStatus);

    item.innerHTML = `
      <div class="appointment-item-copy">
        <div class="appointment-item-meta">
          <div class="appointment-payment-row">
            <span class="status-chip ${statusClass}">${appointment.status}</span>
            <span class="status-chip ${paymentStatusClass}">${paymentStatusLabel}</span>
          </div>
          <h5>${appointment.customerName} - ${appointment.massageType}</h5>
          <p>${formatDate(appointment.appointmentDate)} as ${appointment.appointmentTime}</p>
          <p>Duracao: ${appointment.duration || getServiceDuration(appointment.massageType)}</p>
          <p>Valor: ${formatCurrency(appointment.amount || getServiceAmount(appointment.massageType))}</p>
          <p>Pagamento: ${appointment.paymentMethod}</p>
          <p>Local: ${appointment.serviceRegion || state.settings.businessAddress || "Nao informado"}</p>
          <p>WhatsApp: ${appointment.customerPhone}</p>
          <p>${appointment.customerNotes || "Sem observacoes adicionais."}</p>
        </div>
      </div>
      <div class="appointment-item-actions">
        <button class="secondary-button" data-action="confirm" data-id="${appointment.id}" type="button">Confirmar</button>
        <button class="secondary-button" data-action="paid" data-id="${appointment.id}" type="button">Marcar pago</button>
        <button class="secondary-button" data-action="whatsapp" data-id="${appointment.id}" type="button">WhatsApp</button>
        <button class="ghost-button" data-action="cancel" data-id="${appointment.id}" type="button">Cancelar</button>
      </div>
    `;

    appointmentsList.appendChild(item);
  });

  appointmentsList.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleAppointmentAction(button.dataset.action, button.dataset.id);
    });
  });

  console.log("[Flow] Appointment list rendered");
}

async function handleAppointmentAction(action, appointmentId) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);

  if (!appointment) {
    console.warn("[Flow] Appointment not found for action:", action, appointmentId);
    return;
  }

  console.log("[Flow] Appointment action:", action, appointment);

  if (action === "whatsapp") {
    const url = buildWhatsappUrl(state.settings.businessWhatsapp, buildWhatsappMessage(appointment));
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  const payload = {
    status: action === "cancel" ? "cancelled" : "confirmed",
    paymentStatus: action === "paid" ? "paid" : appointment.paymentStatus,
  };

  try {
    await updateAppointment(appointmentId, payload);
  } catch (error) {
    console.error("[Flow] Failed to update appointment", error);
    window.alert(error.message || "Nao foi possivel atualizar o agendamento.");
  }
}

function renderAdminStats() {
  const total = state.appointments.length;
  const confirmed = state.appointments.filter((item) => item.status === "confirmed").length;
  const cancelled = state.appointments.filter((item) => item.status === "cancelled").length;
  const paid = state.appointments.filter((item) => item.paymentStatus === "paid").length;
  const estimatedRevenue = state.appointments
    .filter((item) => item.status === "confirmed")
    .reduce((totalAmount, item) => totalAmount + (item.amount || getServiceAmount(item.massageType)), 0);
  const paidRevenue = state.appointments
    .filter((item) => item.paymentStatus === "paid")
    .reduce((totalAmount, item) => totalAmount + (item.amount || getServiceAmount(item.massageType)), 0);

  adminStats.innerHTML = `
    <article>
      <strong>${total}</strong>
      <span>Total de reservas</span>
    </article>
    <article>
      <strong>${confirmed}</strong>
      <span>Confirmadas</span>
    </article>
    <article>
      <strong>${cancelled}</strong>
      <span>Canceladas</span>
    </article>
    <article>
      <strong>${paid}</strong>
      <span>Pagas</span>
    </article>
    <article>
      <strong>${formatCurrency(estimatedRevenue)}</strong>
      <span>Receita prevista</span>
    </article>
    <article>
      <strong>${formatCurrency(paidRevenue)}</strong>
      <span>Receita recebida</span>
    </article>
  `;

  console.log("[Flow] Admin stats updated");
}

function openAdminModal() {
  adminLogin.classList.remove("hidden");
  adminContent.classList.add("hidden");
  hydrateSettingsFields();
  adminModal.classList.remove("hidden");
  console.log("[Flow] Admin modal opened");
}

function closeAdminModal() {
  adminModal.classList.add("hidden");
  adminLogin.classList.remove("hidden");
  adminContent.classList.add("hidden");
  adminPasswordField.value = "";
  console.log("[Flow] Admin modal closed");
}

async function handleAdminLogin() {
  state.adminPassword = adminPasswordField.value.trim();

  if (!state.adminPassword) {
    window.alert("Informe a senha administrativa.");
    console.warn("[Flow] Empty admin password rejected");
    return;
  }

  try {
    await Promise.all([loadSettings(), loadAdminAppointments()]);
    hydrateSettingsFields();
    adminLogin.classList.add("hidden");
    adminContent.classList.remove("hidden");
    renderAdminStats();
    renderAppointments();
    console.log("[Flow] Admin login successful");
  } catch (error) {
    state.adminPassword = "";
    window.alert("Senha incorreta ou API indisponivel.");
    console.warn("[Flow] Invalid admin login", error);
  }
}

async function saveSettings() {
  try {
    const parsedServices = parseServicesCatalog(getFieldValue(servicesCatalogField));
    const parsedTimeSlots = parseTimeSlots(getFieldValue(timeSlotsConfigField));
    const parsedPaymentMethods = parsePaymentMethods(getFieldValue(paymentMethodsConfigField));
    const parsedAllowedWeekdays = parseAllowedWeekdays(getFieldValue(allowedWeekdaysConfigField));
    const parsedBlockedDates = parseBlockedDates(getFieldValue(blockedDatesConfigField));

    const payload = {
      businessWhatsapp: sanitizeWhatsappNumber(getFieldValue(businessWhatsappField)),
      mercadoPagoCheckout: getFieldValue(mercadoPagoCheckoutField).trim() || DEFAULT_SETTINGS.mercadoPagoCheckout,
      pixKey: getFieldValue(pixKeyField).trim(),
      businessAddress: getFieldValue(businessAddressField).trim(),
      services: parsedServices,
      timeSlots: parsedTimeSlots,
      paymentMethods: parsedPaymentMethods,
      allowedWeekdays: parsedAllowedWeekdays,
      blockedDates: parsedBlockedDates,
    };

    state.settings = await apiRequest("/api/settings", {
      method: "PUT",
      body: payload,
      includeAdminPassword: true,
    });
    renderMassageOptions();
    renderPaymentMethodOptions();
    renderTimeOptions();
    refreshWhatsappLinks();
    updateBookingSummary();
    window.alert("Configuracoes salvas com sucesso.");
    console.log("[Flow] Settings saved:", state.settings);
  } catch (error) {
    console.error("[Flow] Failed to save settings", error);
    window.alert(error.message || "Nao foi possivel salvar as configuracoes.");
  }
}

function hydrateSettingsFields() {
  setFieldValue(businessWhatsappField, state.settings.businessWhatsapp);
  setFieldValue(mercadoPagoCheckoutField, state.settings.mercadoPagoCheckout);
  setFieldValue(pixKeyField, state.settings.pixKey);
  setFieldValue(businessAddressField, state.settings.businessAddress);
  setFieldValue(
    servicesCatalogField,
    state.settings.services.map((service) => `${service.name}|${service.duration}|${service.price}`).join("\n")
  );
  setFieldValue(timeSlotsConfigField, state.settings.timeSlots.join(","));
  setFieldValue(paymentMethodsConfigField, state.settings.paymentMethods.join("\n"));
  setFieldValue(allowedWeekdaysConfigField, state.settings.allowedWeekdays.join(","));
  setFieldValue(blockedDatesConfigField, state.settings.blockedDates.join("\n"));
}

async function clearCancelledAppointments() {
  try {
    await apiRequest("/api/appointments/cancelled", {
      method: "DELETE",
      includeAdminPassword: true,
    });
    await Promise.all([loadAdminAppointments(), loadAvailability()]);
    renderAdminStats();
    renderAppointments();
    renderTimeOptions();
    console.log("[Flow] Cancelled appointments cleared");
  } catch (error) {
    console.error("[Flow] Failed to clear cancelled appointments", error);
    window.alert(error.message || "Nao foi possivel remover os cancelados.");
  }
}

function refreshWhatsappLinks() {
  const genericMessage =
    "Ola, gostaria de saber mais sobre os atendimentos premium da Flow Terapias.";
  const url = buildWhatsappUrl(state.settings.businessWhatsapp, genericMessage);

  document.getElementById("heroWhatsappButton").href = url;
  document.getElementById("formWhatsappButton").href = url;
  document.getElementById("floatingWhatsappButton").href = url;

  console.log("[Flow] WhatsApp links refreshed:", url);
}

function handleFiltersChange() {
  state.filters.search = appointmentSearchField.value.trim().toLowerCase();
  state.filters.status = appointmentStatusFilterField.value;
  state.filters.paymentStatus = paymentStatusFilterField.value;
  renderAppointments();
  console.log("[Flow] Filters updated:", state.filters);
}

function getFilteredAppointments() {
  return getAppointmentsArray().filter((appointment) => {
    const matchesSearch =
      !state.filters.search ||
      appointment.customerName.toLowerCase().includes(state.filters.search) ||
      appointment.massageType.toLowerCase().includes(state.filters.search) ||
      appointment.customerPhone.toLowerCase().includes(state.filters.search);

    const matchesStatus =
      state.filters.status === "all" || appointment.status === state.filters.status;

    const matchesPaymentStatus =
      state.filters.paymentStatus === "all" ||
      (appointment.paymentStatus || "pending") === state.filters.paymentStatus;

    return matchesSearch && matchesStatus && matchesPaymentStatus;
  });
}

function exportAppointments() {
  const exportData = JSON.stringify(state.appointments, null, 2);
  const blob = new Blob([exportData], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "flow-terapias-agendamentos.json";
  anchor.click();
  URL.revokeObjectURL(url);

  console.log("[Flow] Appointments exported");
}

function exportServedClients() {
  const servedClients = state.appointments
    .filter((appointment) => appointment.status === "confirmed")
    .map((appointment) => ({
      customerName: appointment.customerName,
      customerPhone: appointment.customerPhone,
      customerEmail: appointment.customerEmail,
      massageType: appointment.massageType,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      paymentMethod: appointment.paymentMethod,
      paymentStatus: appointment.paymentStatus,
      amount: appointment.amount,
      duration: appointment.duration,
      serviceRegion: appointment.serviceRegion,
      customerNotes: appointment.customerNotes,
      createdAt: appointment.createdAt,
    }));

  const exportData = JSON.stringify(servedClients, null, 2);
  const blob = new Blob([exportData], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "flow-terapias-clientes-atendidos.json";
  anchor.click();
  URL.revokeObjectURL(url);

  console.log("[Flow] Served clients exported:", servedClients.length);
}

async function loadPublicData() {
  await loadSettings();
  try {
    await loadAvailability();
  } catch (error) {
    console.error("[Flow] loadAvailability failed; continuing with empty slots", error);
    state.availability = [];
  }
  renderMassageOptions();
  renderPaymentMethodOptions();
  refreshWhatsappLinks();
  renderTimeOptions();
}

async function loadSettings() {
  const apiSettings = await apiRequest("/api/settings");
  state.settings = normalizeSettings(apiSettings);
  console.log("[Flow] Loaded settings from API:", state.settings);
  return state.settings;
}

async function loadAvailability() {
  const apiAvailability = await apiRequest("/api/appointments/availability");
  state.availability = Array.isArray(apiAvailability) ? apiAvailability : [];
  console.log("[Flow] Loaded availability:", state.availability);
  return state.availability;
}

async function loadAdminAppointments() {
  const apiAppointments = await apiRequest("/api/appointments", {
    includeAdminPassword: true,
  });
  state.appointments = Array.isArray(apiAppointments) ? apiAppointments : [];
  console.log("[Flow] Loaded admin appointments:", state.appointments);
  return state.appointments;
}

async function updateAppointment(appointmentId, payload) {
  await apiRequest(`/api/appointments/${appointmentId}`, {
    method: "PATCH",
    includeAdminPassword: true,
    body: payload,
  });
  await Promise.all([loadAdminAppointments(), loadAvailability()]);
  renderAdminStats();
  renderAppointments();
  renderTimeOptions();
}

function setMinimumDate() {
  const today = new Date();
  const minDate = today.toISOString().split("T")[0];
  dateField.min = minDate;
  console.log("[Flow] Min date set:", minDate);
}

function enforceBusinessDaySelection() {
  if (!dateField.value) {
    return;
  }

  if (isDateSelectable(dateField.value)) {
    return;
  }

  dateField.value = "";
  timeField.innerHTML = '';
  updateBookingSummary();
  window.alert("Selecione uma data disponivel para atendimento.");
  console.warn("[Flow] Unavailable date selected and cleared");
}

function isDateSelectable(dateString) {
  if (!dateString) {
    return false;
  }

  const date = new Date(`${dateString}T00:00:00`);
  return state.settings.allowedWeekdays.includes(date.getDay()) && !state.settings.blockedDates.includes(dateString);
}

function buildWhatsappMessage(appointment) {
  const addressText = appointment.serviceRegion || state.settings.businessAddress;
  const pixText =
    appointment.paymentMethod === "Pix" && state.settings.pixKey
      ? ` Chave Pix: ${state.settings.pixKey}.`
      : "";

  return (
    `Ola ${appointment.customerName}, seu agendamento na Flow Terapias foi confirmado para ` +
    `${formatDate(appointment.appointmentDate)} as ${appointment.appointmentTime}. ` +
    `Servico: ${appointment.massageType}. Duracao: ${appointment.duration || getServiceDuration(appointment.massageType)}. ` +
    `Valor: ${formatCurrency(appointment.amount || getServiceAmount(appointment.massageType))}. ` +
    `Pagamento: ${appointment.paymentMethod}.` +
    `${addressText ? ` Local: ${addressText}.` : ""}${pixText}`
  );
}

function buildWhatsappUrl(phone, message) {
  const sanitizedPhone = sanitizeWhatsappNumber(phone);
  return `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(message)}`;
}

function notifyAdminPrepayment(appointment) {
  const alertMessage =
    "Pagamento antecipado solicitado. Um aviso para o WhatsApp administrativo sera aberto agora.";
  window.alert(alertMessage);

  const adminMessage =
    `Novo pedido de pagamento antecipado - Flow Terapias.\n` +
    `Cliente: ${appointment.customerName}\n` +
    `WhatsApp: ${appointment.customerPhone}\n` +
    `Servico: ${appointment.massageType}\n` +
    `Data: ${formatDate(appointment.appointmentDate)}\n` +
    `Horario: ${appointment.appointmentTime}\n` +
    `Pagamento: ${appointment.paymentMethod}\n` +
    `Valor: ${formatCurrency(appointment.amount)}.`;

  const adminUrl = buildWhatsappUrl(ADMIN_ALERT_WHATSAPP, adminMessage);
  window.open(adminUrl, "_blank", "noopener,noreferrer");
  console.log("[Flow] Admin prepayment alert sent:", appointment.id);
}

function isPrepaymentMethod(paymentMethod) {
  return PREPAYMENT_METHODS.has(paymentMethod);
}

function sanitizeWhatsappNumber(phone) {
  return (phone || DEFAULT_SETTINGS.businessWhatsapp).replace(/\D/g, "");
}

function formatDate(dateString) {
  if (!dateString) {
    return "data a definir";
  }

  const [year, month, day] = dateString.split("-");
  return `${day}/${month}/${year}`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount || 0);
}

function getServiceAmount(serviceName) {
  const service = state.settings.services.find((item) => item.name === serviceName);
  return service?.price || 0;
}

function getServiceDuration(serviceName) {
  const service = state.settings.services.find((item) => item.name === serviceName);
  return service?.duration || "Sob consulta";
}

function renderMassageOptions() {
  const previousValue = getRadioValue("massageType");
  massageTypeField.innerHTML = '';

  state.settings.services.forEach((service) => {
    const label = document.createElement("label");
    label.className = "radio-card";

    label.innerHTML = `
      <input type="radio" name="massageType" value="${service.name}" required>
      <div class="radio-card-content">
        <span style="display:block;">${service.name}</span>
        <strong style="color:var(--gold-soft);font-size:0.85rem;margin-top:6px;display:block;">${formatCurrency(service.price)}</strong>
      </div>
    `;
    massageTypeField.appendChild(label);
  });

  if (previousValue && state.settings.services.some((service) => service.name === previousValue)) {
    const radio = massageTypeField.querySelector(`input[value="${previousValue}"]`);
    if (radio) radio.checked = true;
  }
}

function renderPaymentMethodOptions() {
  const previousValue = getRadioValue("paymentMethod");
  paymentMethodField.innerHTML = '';

  state.settings.paymentMethods.forEach((method) => {
    const label = document.createElement("label");
    label.className = "radio-card";

    label.innerHTML = `
      <input type="radio" name="paymentMethod" value="${method}" required>
      <div class="radio-card-content">${method}</div>
    `;
    paymentMethodField.appendChild(label);
  });

  if (previousValue && state.settings.paymentMethods.includes(previousValue)) {
    const radio = paymentMethodField.querySelector(`input[value="${previousValue}"]`);
    if (radio) radio.checked = true;
  }
}

function parseServicesCatalog(value) {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const services = lines
    .map((line) => {
      const [nameRaw, durationRaw, priceRaw] = line.split("|");
      const name = String(nameRaw || "").trim();
      const duration = String(durationRaw || "").trim();
      const price = Number(String(priceRaw || "").replace(",", "."));

      if (!name || !duration || !Number.isFinite(price) || price < 0) {
        return null;
      }

      return { name, duration, price };
    })
    .filter(Boolean);

  return services.length ? services : DEFAULT_SETTINGS.services;
}

function parseTimeSlots(value) {
  const slots = value
    .split(",")
    .map((slot) => slot.trim())
    .filter((slot) => /^\d{2}:\d{2}$/.test(slot));
  return slots.length ? [...new Set(slots)] : DEFAULT_SETTINGS.timeSlots;
}

function parsePaymentMethods(value) {
  const methods = value
    .split("\n")
    .map((method) => method.trim())
    .filter(Boolean);
  return methods.length ? [...new Set(methods)] : DEFAULT_SETTINGS.paymentMethods;
}

function parseAllowedWeekdays(value) {
  const weekdays = value
    .split(",")
    .map((day) => Number(day.trim()))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return weekdays.length ? [...new Set(weekdays)] : DEFAULT_SETTINGS.allowedWeekdays;
}

function parseBlockedDates(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d{4}-\d{2}-\d{2}$/.test(line));
}

function normalizeSettings(settings) {
  return {
    businessWhatsapp: String(settings?.businessWhatsapp || DEFAULT_SETTINGS.businessWhatsapp),
    mercadoPagoCheckout: String(settings?.mercadoPagoCheckout || DEFAULT_SETTINGS.mercadoPagoCheckout),
    pixKey: String(settings?.pixKey || ""),
    businessAddress: String(settings?.businessAddress || ""),
    services: sanitizeServicesArray(settings?.services),
    timeSlots: sanitizeTimeSlotsArray(settings?.timeSlots),
    paymentMethods: sanitizePaymentMethodsArray(settings?.paymentMethods),
    allowedWeekdays: sanitizeAllowedWeekdaysArray(settings?.allowedWeekdays),
    blockedDates: sanitizeBlockedDatesArray(settings?.blockedDates),
  };
}

function sanitizeServicesArray(services) {
  const value = Array.isArray(services) ? services : [];
  const normalized = value
    .map((service) => ({
      name: String(service?.name || "").trim(),
      duration: String(service?.duration || "").trim(),
      price: Number(service?.price || 0),
    }))
    .filter((service) => service.name && service.duration && Number.isFinite(service.price) && service.price >= 0);

  return normalized.length ? normalized : DEFAULT_SETTINGS.services;
}

function sanitizeTimeSlotsArray(timeSlots) {
  const value = Array.isArray(timeSlots) ? timeSlots : [];
  const normalized = [...new Set(value.map((slot) => String(slot || "").trim()))].filter((slot) =>
    /^\d{2}:\d{2}$/.test(slot)
  );
  return normalized.length ? normalized : DEFAULT_SETTINGS.timeSlots;
}

function sanitizePaymentMethodsArray(paymentMethods) {
  const value = Array.isArray(paymentMethods) ? paymentMethods : [];
  const normalized = [...new Set(value.map((method) => String(method || "").trim()).filter(Boolean))];
  return normalized.length ? normalized : DEFAULT_SETTINGS.paymentMethods;
}

function sanitizeAllowedWeekdaysArray(allowedWeekdays) {
  const value = Array.isArray(allowedWeekdays) ? allowedWeekdays : [];
  const normalized = [...new Set(value.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  return normalized.length ? normalized : DEFAULT_SETTINGS.allowedWeekdays;
}

function sanitizeBlockedDatesArray(blockedDates) {
  const value = Array.isArray(blockedDates) ? blockedDates : [];
  return [...new Set(value.map((date) => String(date || "").trim()))].filter((date) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date)
  );
}

function updateBookingSummary() {
  const selectedService = getRadioValue("massageType");
  const selectedDate = dateField.value;
  const selectedTime = getRadioValue("appointmentTime");
  const selectedPayment = getRadioValue("paymentMethod");
  const selectedRegion = serviceRegionField.value.trim();

  summaryService.textContent = selectedService || "Selecione uma massagem";
  summaryDuration.textContent = selectedService ? getServiceDuration(selectedService) : "-";
  summaryPrice.textContent = selectedService ? formatCurrency(getServiceAmount(selectedService)) : "-";
  summaryPayment.textContent = selectedPayment || "-";
  summaryRegion.textContent = selectedRegion || state.settings.businessAddress || "-";

  if (selectedDate && selectedTime) {
    summaryDateTime.textContent = `${formatDate(selectedDate)} as ${selectedTime}`;
  } else if (selectedDate) {
    summaryDateTime.textContent = formatDate(selectedDate);
  } else {
    summaryDateTime.textContent = "-";
  }

  console.log("[Flow] Booking summary updated", {
    selectedService,
    selectedDate,
    selectedTime,
    selectedPayment,
    selectedRegion,
  });
}

function getStatusClassName(status) {
  if (status === "confirmed") {
    return "status-confirmed";
  }

  if (status === "cancelled") {
    return "status-cancelled";
  }

  return "status-pending";
}

function getAvailabilityArray() {
  return Array.isArray(state.availability) ? state.availability : [];
}

function getAppointmentsArray() {
  return Array.isArray(state.appointments) ? state.appointments : [];
}

function getPaymentStatusClassName(status) {
  if (status === "paid") {
    return "payment-paid";
  }

  return "payment-pending";
}

function getPaymentStatusLabel(status) {
  if (status === "paid") {
    return "pago";
  }

  return "pendente";
}

function getFieldValue(field) {
  return field ? String(field.value || "") : "";
}

function setFieldValue(field, value) {
  if (field) {
    field.value = value;
  }
}

async function apiRequest(endpoint, options = {}) {
  const method = options.method || "GET";
  const requestOptions = {
    method,
    headers: {},
  };

  if (options.includeAdminPassword && state.adminPassword) {
    requestOptions.headers["x-admin-password"] = state.adminPassword;
  }

  // Avoid Content-Type on GET/HEAD so the request stays "simple" (no CORS preflight noise).
  if (method !== "GET" && method !== "HEAD") {
    requestOptions.headers["Content-Type"] = "application/json";
  }

  if (options.body) {
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildApiUrl(endpoint), requestOptions);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const statusHint = `${response.status} ${response.statusText || ""}`.trim();
    const message = data.message || statusHint || "Falha na comunicacao com a API.";
    console.error("[Flow] API error:", endpoint, statusHint, data);
    throw new Error(message);
  }

  return data;
}

function buildApiUrl(endpoint) {
  const configured = (APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");
  if (configured) {
    return `${configured}${endpoint}`;
  }

  const host = window.location.hostname || "";
  if (host.endsWith("github.io")) {
    console.warn("[Flow] apiBaseUrl empty on GitHub Pages; using fallback API:", FALLBACK_API_BASE);
    return `${FALLBACK_API_BASE}${endpoint}`;
  }

  return endpoint;
}
