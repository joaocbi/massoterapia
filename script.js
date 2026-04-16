const APP_CONFIG = window.LUXOR_CONFIG || {};
const DEFAULT_SETTINGS = {
  businessWhatsapp: "5511999999999",
  mercadoPagoCheckout: "https://www.mercadopago.com.br/",
  pixKey: "",
  businessAddress: "",
};
const AVAILABLE_TIMES = ["09:00", "10:30", "12:00", "14:00", "15:30", "17:00", "18:30", "20:00"];
const SERVICE_DETAILS = {
  "Massagem Relaxante Luxor": { duration: "60 min", price: 180 },
  "Massagem Terapeutica Premium": { duration: "75 min", price: 240 },
  "Pedras Quentes e Aromas": { duration: "90 min", price: 320 },
  "Drenagem Linfatica": { duration: "60 min", price: 210 },
  "Massagem Modeladora": { duration: "50 min", price: 190 },
  "Atendimento Personalizado": { duration: "Sob consulta", price: 260 },
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

console.log("[Luxor] Site initialized");
console.log("[Luxor] App config:", APP_CONFIG);

init().catch((error) => {
  console.error("[Luxor] Failed to initialize application", error);
  window.alert("Nao foi possivel inicializar o sistema. Verifique a API.");
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
  dateField.addEventListener("change", renderTimeOptions);
  dateField.addEventListener("change", updateBookingSummary);
  timeField.addEventListener("change", updateBookingSummary);
  massageTypeField.addEventListener("change", updateBookingSummary);
  paymentMethodField.addEventListener("change", updateBookingSummary);
  serviceRegionField.addEventListener("input", updateBookingSummary);

  document.querySelectorAll(".service-select-button").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedService = button.dataset.service || "";
      massageTypeField.value = selectedService;
      updateBookingSummary();
      document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
      console.log("[Luxor] Service pre-selected:", selectedService);
    });
  });

  document.getElementById("openAdminModal").addEventListener("click", openAdminModal);
  document.getElementById("closeAdminModal").addEventListener("click", closeAdminModal);
  document.getElementById("adminLoginButton").addEventListener("click", handleAdminLogin);
  document.getElementById("saveSettingsButton").addEventListener("click", saveSettings);
  document.getElementById("clearCompletedButton").addEventListener("click", clearCancelledAppointments);
  document.getElementById("exportAppointmentsButton").addEventListener("click", exportAppointments);
  appointmentSearchField.addEventListener("input", handleFiltersChange);
  appointmentStatusFilterField.addEventListener("change", handleFiltersChange);
  paymentStatusFilterField.addEventListener("change", handleFiltersChange);
  adminModal.addEventListener("click", (event) => {
    if (event.target === adminModal) {
      closeAdminModal();
    }
  });
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

  console.log("[Luxor] Booking submit payload:", bookingPayload);

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
    console.error("[Luxor] Failed to create booking", error);
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

  if (appointment.paymentMethod === "Pix" && state.settings.pixKey) {
    confirmationText.textContent += ` Chave Pix para pagamento: ${state.settings.pixKey}.`;
  }

  if (appointment.serviceRegion) {
    confirmationText.textContent += ` Local: ${appointment.serviceRegion}.`;
  }

  confirmationWhatsappLink.href = buildWhatsappUrl(state.settings.businessWhatsapp, message);
  confirmationCard.classList.remove("hidden");
  confirmationCard.scrollIntoView({ behavior: "smooth", block: "center" });

  if (appointment.paymentMethod === "Mercado Pago" && checkoutUrl) {
    mercadoPagoLink.classList.remove("hidden");
    mercadoPagoLink.href = checkoutUrl;
  } else {
    mercadoPagoLink.classList.add("hidden");
    mercadoPagoLink.href = "#";
  }

  console.log("[Luxor] Confirmation displayed for booking:", appointment.id);
}

function renderTimeOptions() {
  const selectedDate = dateField.value;
  const occupiedTimes = new Set(
    state.availability
      .filter((item) => item.appointmentDate === selectedDate && item.status !== "cancelled")
      .map((item) => item.appointmentTime)
  );

  const previousValue = timeField.value;
  timeField.innerHTML = '<option value="">Selecione</option>';

  AVAILABLE_TIMES.forEach((time) => {
    const option = document.createElement("option");
    const isBooked = occupiedTimes.has(time);

    option.value = time;
    option.textContent = isBooked ? `${time} - indisponivel` : time;
    option.disabled = isBooked;

    timeField.appendChild(option);
  });

  if (previousValue && !occupiedTimes.has(previousValue)) {
    timeField.value = previousValue;
  }

  console.log("[Luxor] Time options rendered for date:", selectedDate, "occupied:", [...occupiedTimes]);
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

  console.log("[Luxor] Appointment list rendered");
}

async function handleAppointmentAction(action, appointmentId) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);

  if (!appointment) {
    console.warn("[Luxor] Appointment not found for action:", action, appointmentId);
    return;
  }

  console.log("[Luxor] Appointment action:", action, appointment);

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
    console.error("[Luxor] Failed to update appointment", error);
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

  console.log("[Luxor] Admin stats updated");
}

function openAdminModal() {
  adminLogin.classList.remove("hidden");
  adminContent.classList.add("hidden");
  hydrateSettingsFields();
  adminModal.classList.remove("hidden");
  console.log("[Luxor] Admin modal opened");
}

function closeAdminModal() {
  adminModal.classList.add("hidden");
  adminLogin.classList.remove("hidden");
  adminContent.classList.add("hidden");
  adminPasswordField.value = "";
  console.log("[Luxor] Admin modal closed");
}

async function handleAdminLogin() {
  state.adminPassword = adminPasswordField.value.trim();

  if (!state.adminPassword) {
    window.alert("Informe a senha administrativa.");
    console.warn("[Luxor] Empty admin password rejected");
    return;
  }

  try {
    await Promise.all([loadSettings(), loadAdminAppointments()]);
    hydrateSettingsFields();
    adminLogin.classList.add("hidden");
    adminContent.classList.remove("hidden");
    renderAdminStats();
    renderAppointments();
    console.log("[Luxor] Admin login successful");
  } catch (error) {
    state.adminPassword = "";
    window.alert("Senha incorreta ou API indisponivel.");
    console.warn("[Luxor] Invalid admin login", error);
  }
}

async function saveSettings() {
  const payload = {
    businessWhatsapp: sanitizeWhatsappNumber(businessWhatsappField.value),
    mercadoPagoCheckout: mercadoPagoCheckoutField.value.trim() || DEFAULT_SETTINGS.mercadoPagoCheckout,
    pixKey: pixKeyField.value.trim(),
    businessAddress: businessAddressField.value.trim(),
  };

  try {
    state.settings = await apiRequest("/api/settings", {
      method: "PUT",
      body: payload,
      includeAdminPassword: true,
    });
    refreshWhatsappLinks();
    updateBookingSummary();
    window.alert("Configuracoes salvas com sucesso.");
    console.log("[Luxor] Settings saved:", state.settings);
  } catch (error) {
    console.error("[Luxor] Failed to save settings", error);
    window.alert(error.message || "Nao foi possivel salvar as configuracoes.");
  }
}

function hydrateSettingsFields() {
  businessWhatsappField.value = state.settings.businessWhatsapp;
  mercadoPagoCheckoutField.value = state.settings.mercadoPagoCheckout;
  pixKeyField.value = state.settings.pixKey;
  businessAddressField.value = state.settings.businessAddress;
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
    console.log("[Luxor] Cancelled appointments cleared");
  } catch (error) {
    console.error("[Luxor] Failed to clear cancelled appointments", error);
    window.alert(error.message || "Nao foi possivel remover os cancelados.");
  }
}

function refreshWhatsappLinks() {
  const genericMessage =
    "Ola, gostaria de saber mais sobre os atendimentos premium da Luxor Massoterapia.";
  const url = buildWhatsappUrl(state.settings.businessWhatsapp, genericMessage);

  document.getElementById("heroWhatsappButton").href = url;
  document.getElementById("formWhatsappButton").href = url;
  document.getElementById("floatingWhatsappButton").href = url;

  console.log("[Luxor] WhatsApp links refreshed:", url);
}

function handleFiltersChange() {
  state.filters.search = appointmentSearchField.value.trim().toLowerCase();
  state.filters.status = appointmentStatusFilterField.value;
  state.filters.paymentStatus = paymentStatusFilterField.value;
  renderAppointments();
  console.log("[Luxor] Filters updated:", state.filters);
}

function getFilteredAppointments() {
  return state.appointments.filter((appointment) => {
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
  anchor.download = "luxor-agendamentos.json";
  anchor.click();
  URL.revokeObjectURL(url);

  console.log("[Luxor] Appointments exported");
}

async function loadPublicData() {
  await Promise.all([loadSettings(), loadAvailability()]);
  refreshWhatsappLinks();
  renderTimeOptions();
}

async function loadSettings() {
  state.settings = await apiRequest("/api/settings");
  console.log("[Luxor] Loaded settings from API:", state.settings);
  return state.settings;
}

async function loadAvailability() {
  state.availability = await apiRequest("/api/appointments/availability");
  console.log("[Luxor] Loaded availability:", state.availability);
  return state.availability;
}

async function loadAdminAppointments() {
  state.appointments = await apiRequest("/api/appointments", {
    includeAdminPassword: true,
  });
  console.log("[Luxor] Loaded admin appointments:", state.appointments);
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
  console.log("[Luxor] Min date set:", minDate);
}

function buildWhatsappMessage(appointment) {
  const addressText = appointment.serviceRegion || state.settings.businessAddress;
  const pixText =
    appointment.paymentMethod === "Pix" && state.settings.pixKey
      ? ` Chave Pix: ${state.settings.pixKey}.`
      : "";

  return (
    `Ola ${appointment.customerName}, seu agendamento na Luxor Massoterapia foi confirmado para ` +
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
  return SERVICE_DETAILS[serviceName]?.price || 0;
}

function getServiceDuration(serviceName) {
  return SERVICE_DETAILS[serviceName]?.duration || "Sob consulta";
}

function updateBookingSummary() {
  const selectedService = massageTypeField.value;
  const selectedDate = dateField.value;
  const selectedTime = timeField.value;
  const selectedPayment = paymentMethodField.value;
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

  console.log("[Luxor] Booking summary updated", {
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

async function apiRequest(endpoint, options = {}) {
  const requestOptions = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.includeAdminPassword && state.adminPassword
        ? { "x-admin-password": state.adminPassword }
        : {}),
    },
  };

  if (options.body) {
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildApiUrl(endpoint), requestOptions);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Falha na comunicacao com a API.");
  }

  return data;
}

function buildApiUrl(endpoint) {
  const baseUrl = (APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");
  return baseUrl ? `${baseUrl}${endpoint}` : endpoint;
}
