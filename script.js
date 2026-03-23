const STORAGE_KEYS = {
  appointments: "luxor_massoterapia_appointments",
  settings: "luxor_massoterapia_settings",
};

const DEFAULT_SETTINGS = {
  businessWhatsapp: "5511999999999",
  mercadoPagoCheckout: "https://www.mercadopago.com.br/",
  pixKey: "",
  businessAddress: "",
};

const ADMIN_PASSWORD = "luxor2026";
const AVAILABLE_TIMES = [
  "09:00",
  "10:30",
  "12:00",
  "14:00",
  "15:30",
  "17:00",
  "18:30",
  "20:00",
];

const state = {
  appointments: loadAppointments(),
  settings: loadSettings(),
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

console.log("[Luxor] Site initialized");
console.log("[Luxor] Loaded appointments:", state.appointments);
console.log("[Luxor] Loaded settings:", state.settings);

init();

function init() {
  setMinimumDate();
  renderTimeOptions();
  renderAdminStats();
  renderAppointments();
  hydrateSettingsFields();
  bindEvents();
  refreshWhatsappLinks();
}

function bindEvents() {
  bookingForm.addEventListener("submit", handleBookingSubmit);
  dateField.addEventListener("change", renderTimeOptions);
  document.querySelectorAll(".service-select-button").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedService = button.dataset.service || "";
      massageTypeField.value = selectedService;
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

function handleBookingSubmit(event) {
  event.preventDefault();

  const formData = new FormData(bookingForm);
  const appointment = {
    id: crypto.randomUUID(),
    customerName: formData.get("customerName")?.toString().trim(),
    customerPhone: formData.get("customerPhone")?.toString().trim(),
    customerEmail: formData.get("customerEmail")?.toString().trim(),
    massageType: formData.get("massageType")?.toString().trim(),
    appointmentDate: formData.get("appointmentDate")?.toString().trim(),
    appointmentTime: formData.get("appointmentTime")?.toString().trim(),
    paymentMethod: formData.get("paymentMethod")?.toString().trim(),
    serviceRegion: formData.get("serviceRegion")?.toString().trim(),
    customerNotes: formData.get("customerNotes")?.toString().trim(),
    status: "confirmed",
    paymentStatus: "pending",
    createdAt: new Date().toISOString(),
  };

  console.log("[Luxor] Booking submit payload:", appointment);

  if (!isSlotAvailable(appointment.appointmentDate, appointment.appointmentTime)) {
    window.alert("Este horario ja foi reservado. Escolha outro horario.");
    console.warn("[Luxor] Attempted duplicate slot:", appointment.appointmentDate, appointment.appointmentTime);
    return;
  }

  state.appointments.unshift(appointment);
  persistAppointments();
  renderTimeOptions();
  renderAdminStats();
  renderAppointments();
  showConfirmation(appointment);
  bookingForm.reset();
  setMinimumDate();

  if (appointment.paymentMethod === "Mercado Pago") {
    console.log("[Luxor] Mercado Pago selected, preparing checkout link");
    mercadoPagoLink.classList.remove("hidden");
    mercadoPagoLink.href = state.settings.mercadoPagoCheckout;
  } else {
    mercadoPagoLink.classList.add("hidden");
  }
}

function showConfirmation(appointment) {
  const readableDate = formatDate(appointment.appointmentDate);
  const message = buildWhatsappMessage(appointment);

  confirmationTitle.textContent = `${appointment.customerName}, seu horario foi confirmado.`;
  confirmationText.textContent =
    `${appointment.massageType} agendada para ${readableDate} as ${appointment.appointmentTime}. ` +
    `Pagamento escolhido: ${appointment.paymentMethod}.`;

  if (appointment.paymentMethod === "Pix" && state.settings.pixKey) {
    confirmationText.textContent += ` Chave Pix para pagamento: ${state.settings.pixKey}.`;
  }

  if (appointment.serviceRegion) {
    confirmationText.textContent += ` Local: ${appointment.serviceRegion}.`;
  }
  confirmationWhatsappLink.href = buildWhatsappUrl(state.settings.businessWhatsapp, message);
  confirmationCard.classList.remove("hidden");
  confirmationCard.scrollIntoView({ behavior: "smooth", block: "center" });

  console.log("[Luxor] Confirmation displayed for booking:", appointment.id);
}

function renderTimeOptions() {
  const selectedDate = dateField.value;
  const occupiedTimes = new Set(
    state.appointments
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
    button.addEventListener("click", () => handleAppointmentAction(button.dataset.action, button.dataset.id));
  });

  console.log("[Luxor] Appointment list rendered");
}

function handleAppointmentAction(action, appointmentId) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);

  if (!appointment) {
    console.warn("[Luxor] Appointment not found for action:", action, appointmentId);
    return;
  }

  console.log("[Luxor] Appointment action:", action, appointment);

  if (action === "confirm") {
    appointment.status = "confirmed";
  }

  if (action === "paid") {
    appointment.paymentStatus = "paid";
  }

  if (action === "cancel") {
    appointment.status = "cancelled";
  }

  if (action === "whatsapp") {
    const url = buildWhatsappUrl(state.settings.businessWhatsapp, buildWhatsappMessage(appointment));
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  persistAppointments();
  renderTimeOptions();
  renderAdminStats();
  renderAppointments();
}

function renderAdminStats() {
  const total = state.appointments.length;
  const confirmed = state.appointments.filter((item) => item.status === "confirmed").length;
  const cancelled = state.appointments.filter((item) => item.status === "cancelled").length;
  const paid = state.appointments.filter((item) => item.paymentStatus === "paid").length;

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

function handleAdminLogin() {
  if (adminPasswordField.value !== ADMIN_PASSWORD) {
    window.alert("Senha incorreta.");
    console.warn("[Luxor] Invalid admin password attempt");
    return;
  }

  adminLogin.classList.add("hidden");
  adminContent.classList.remove("hidden");
  console.log("[Luxor] Admin login successful");
}

function saveSettings() {
  state.settings = {
    businessWhatsapp: sanitizeWhatsappNumber(businessWhatsappField.value),
    mercadoPagoCheckout: mercadoPagoCheckoutField.value.trim() || DEFAULT_SETTINGS.mercadoPagoCheckout,
    pixKey: pixKeyField.value.trim(),
    businessAddress: businessAddressField.value.trim(),
  };

  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  refreshWhatsappLinks();
  window.alert("Configuracoes salvas com sucesso.");
  console.log("[Luxor] Settings saved:", state.settings);
}

function hydrateSettingsFields() {
  businessWhatsappField.value = state.settings.businessWhatsapp;
  mercadoPagoCheckoutField.value = state.settings.mercadoPagoCheckout;
  pixKeyField.value = state.settings.pixKey;
  businessAddressField.value = state.settings.businessAddress;
}

function clearCancelledAppointments() {
  state.appointments = state.appointments.filter((item) => item.status !== "cancelled");
  persistAppointments();
  renderAdminStats();
  renderAppointments();
  renderTimeOptions();
  console.log("[Luxor] Cancelled appointments cleared");
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

function isSlotAvailable(date, time) {
  return !state.appointments.some(
    (item) =>
      item.appointmentDate === date &&
      item.appointmentTime === time &&
      item.status !== "cancelled"
  );
}

function loadAppointments() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.appointments) || "[]").map((appointment) => ({
      paymentStatus: "pending",
      ...appointment,
    }));
  } catch (error) {
    console.error("[Luxor] Failed to parse appointments from storage", error);
    return [];
  }
}

function loadSettings() {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}"),
    };
  } catch (error) {
    console.error("[Luxor] Failed to parse settings from storage", error);
    return { ...DEFAULT_SETTINGS };
  }
}

function persistAppointments() {
  localStorage.setItem(STORAGE_KEYS.appointments, JSON.stringify(state.appointments));
  console.log("[Luxor] Appointments saved:", state.appointments);
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
    `Servico: ${appointment.massageType}. Pagamento: ${appointment.paymentMethod}.` +
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
