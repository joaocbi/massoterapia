const APP_CONFIG = window.LUXOR_CONFIG || {};
const BRAND_NAME = APP_CONFIG.brandName || "Flow Terapias";
const FALLBACK_API_BASE = "https://flowterapia.vercel.app";
const DEFAULT_BOUNDARY_OPTIONS = [
  "Atendimento exclusivamente profissional",
  "Nao realizo qualquer contato intimo",
  "Nao aceito pedidos inapropriados",
  "Sessao encerrada em caso de desrespeito",
  "Privacidade e respeito sao obrigatorios",
];

const DEFAULT_SETTINGS = {
  businessWhatsapp: "5542991628586",
  mercadoPagoCheckout: "",
  pixKey: "",
  businessAddress: "",
  blockedDates: [],
  professionals: [],
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

const state = {
  adminPassword: "",
  appointments: [],
  availability: [],
  professionalApplications: [],
  settings: structuredClone(DEFAULT_SETTINGS),
  selectedProfessionalId: "",
  filters: {
    search: "",
    status: "all",
    paymentStatus: "all",
    applicationSearch: "",
    applicationStatus: "all",
    subscriptionStatus: "all",
  },
};

const bookingForm = document.getElementById("bookingForm");
const professionalApplicationForm = document.getElementById("professionalApplicationForm");
const professionalCards = document.getElementById("professionalCards");
const professionalSelector = document.getElementById("professionalSelector");
const selectedProfessionalPanel = document.getElementById("selectedProfessionalPanel");
const professionalAddressDisplay = document.getElementById("professionalAddressDisplay");
const selectedWeekdaysNote = document.getElementById("selectedWeekdaysNote");
const massageTypeField = document.getElementById("massageType");
const dateField = document.getElementById("appointmentDate");
const timeField = document.getElementById("appointmentTime");
const paymentMethodField = document.getElementById("paymentMethod");
const serviceRegionField = document.getElementById("serviceRegion");
const confirmationCard = document.getElementById("confirmationCard");
const confirmationTitle = document.getElementById("confirmationTitle");
const confirmationText = document.getElementById("confirmationText");
const confirmationWhatsappLink = document.getElementById("confirmationWhatsappLink");
const summaryProfessional = document.getElementById("summaryProfessional");
const summaryService = document.getElementById("summaryService");
const summaryDuration = document.getElementById("summaryDuration");
const summaryPrice = document.getElementById("summaryPrice");
const summaryPayment = document.getElementById("summaryPayment");
const summaryRegion = document.getElementById("summaryRegion");
const summaryDateTime = document.getElementById("summaryDateTime");

const appointmentsList = document.getElementById("appointmentsList");
const professionalApplicationsList = document.getElementById("professionalApplicationsList");
const adminStats = document.getElementById("adminStats");
const adminModal = document.getElementById("adminModal");
const adminLogin = document.getElementById("adminLogin");
const adminContent = document.getElementById("adminContent");
const adminPasswordField = document.getElementById("adminPassword");
const businessWhatsappField = document.getElementById("businessWhatsapp");
const pixKeyField = document.getElementById("pixKey");
const businessAddressField = document.getElementById("businessAddress");
const addProfessionalButton = document.getElementById("addProfessionalButton");
const professionalsEditor = document.getElementById("professionalsEditor");
const professionalsCatalogField = document.getElementById("professionalsCatalog");
const blockedDatesConfigField = document.getElementById("blockedDatesConfig");
const appointmentSearchField = document.getElementById("appointmentSearch");
const appointmentStatusFilterField = document.getElementById("appointmentStatusFilter");
const paymentStatusFilterField = document.getElementById("paymentStatusFilter");
const applicationSearchField = document.getElementById("applicationSearch");
const applicationStatusFilterField = document.getElementById("applicationStatusFilter");
const subscriptionStatusFilterField = document.getElementById("subscriptionStatusFilter");
const applicationConfirmationCard = document.getElementById("applicationConfirmationCard");
const applicationConfirmationTitle = document.getElementById("applicationConfirmationTitle");
const applicationConfirmationText = document.getElementById("applicationConfirmationText");

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
  if (shouldOpenAdminFromUrl()) {
    openAdminModal();
  }
}

function bindEvents() {
  bookingForm.addEventListener("submit", handleBookingSubmit);
  professionalApplicationForm?.addEventListener("submit", handleProfessionalApplicationSubmit);
  dateField.addEventListener("change", enforceBusinessDaySelection);
  dateField.addEventListener("change", renderTimeOptions);
  dateField.addEventListener("change", updateBookingSummary);
  massageTypeField.addEventListener("change", updateBookingSummary);
  paymentMethodField.addEventListener("change", updateBookingSummary);
  timeField.addEventListener("change", updateBookingSummary);
  serviceRegionField.addEventListener("input", updateBookingSummary);
  professionalSelector.addEventListener("change", handleProfessionalChange);

  const closeAdminButton = document.getElementById("closeAdminModal");
  const adminLoginButton = document.getElementById("adminLoginButton");
  const saveSettingsButton = document.getElementById("saveSettingsButton");
  const clearCompletedButton = document.getElementById("clearCompletedButton");
  const exportAppointmentsButton = document.getElementById("exportAppointmentsButton");
  const exportServedClientsButton = document.getElementById("exportServedClientsButton");

  closeAdminButton?.addEventListener("click", closeAdminModal);
  adminLoginButton?.addEventListener("click", handleAdminLogin);
  saveSettingsButton?.addEventListener("click", saveSettings);
  clearCompletedButton?.addEventListener("click", clearCancelledAppointments);
  exportAppointmentsButton?.addEventListener("click", exportAppointments);
  exportServedClientsButton?.addEventListener("click", exportServedClients);
  addProfessionalButton?.addEventListener("click", handleAddProfessional);
  appointmentSearchField?.addEventListener("input", handleFiltersChange);
  appointmentStatusFilterField?.addEventListener("change", handleFiltersChange);
  paymentStatusFilterField?.addEventListener("change", handleFiltersChange);
  applicationSearchField?.addEventListener("input", handleFiltersChange);
  applicationStatusFilterField?.addEventListener("change", handleFiltersChange);
  subscriptionStatusFilterField?.addEventListener("change", handleFiltersChange);

  adminModal?.addEventListener("click", (event) => {
    if (event.target === adminModal) {
      closeAdminModal();
    }
  });

  professionalsEditor?.addEventListener("click", handleProfessionalEditorActions);
  professionalsEditor?.addEventListener("input", syncProfessionalsPreviewFromEditor);
}

function shouldOpenAdminFromUrl() {
  const query = new URLSearchParams(window.location.search || "");
  if (query.get("admin") === "1") {
    return true;
  }

  const pathname = String(window.location.pathname || "").replace(/\/+$/, "");
  return pathname === "/admin" || pathname === "/fisiosaude/admin";
}

function getRadioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : "";
}

function getSelectedProfessional() {
  const professionals = Array.isArray(state.settings.professionals) ? state.settings.professionals : [];
  return (
    professionals.find((item) => item.id === state.selectedProfessionalId) ||
    professionals[0] ||
    null
  );
}

function getSelectedService() {
  const selectedProfessional = getSelectedProfessional();
  if (!selectedProfessional) {
    return null;
  }
  const serviceName = getRadioValue("massageType");
  return selectedProfessional.services.find((item) => item.name === serviceName) || null;
}

function handleProfessionalChange() {
  state.selectedProfessionalId = getRadioValue("professionalId") || "";
  renderSelectedProfessionalState();
}

function selectProfessional(professionalId, options = {}) {
  state.selectedProfessionalId = professionalId;
  const radio = professionalSelector.querySelector(`input[value="${professionalId}"]`);
  if (radio) {
    radio.checked = true;
  }

  renderSelectedProfessionalState();

  if (options.scrollToBooking) {
    document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
  }
}

function renderSelectedProfessionalState() {
  const professional = getSelectedProfessional();
  renderProfessionalCards();
  renderSelectedProfessionalPanel();
  renderProfessionalOptions();
  renderServiceOptions();
  renderPaymentMethodOptions();
  renderTimeOptions();
  refreshProfessionalAddressField();
  refreshWhatsappLinks();
  updateWeekdaysNote();
  bookingForm.querySelectorAll("input, textarea, button, select").forEach((field) => {
    field.disabled = !professional;
  });
  const formWhatsappButton = document.getElementById("formWhatsappButton");
  if (formWhatsappButton) {
    formWhatsappButton.classList.toggle("is-disabled", !professional);
    formWhatsappButton.setAttribute("aria-disabled", professional ? "false" : "true");
    formWhatsappButton.tabIndex = professional ? 0 : -1;
  }
  updateBookingSummary();
}

async function handleBookingSubmit(event) {
  event.preventDefault();

  const professional = getSelectedProfessional();
  if (!professional) {
    window.alert("Nenhuma profissional cadastrada no momento.");
    return;
  }
  const formData = new FormData(bookingForm);
  const bookingPayload = {
    professionalId: professional.id,
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

  if (!isDateSelectable(bookingPayload.appointmentDate)) {
    window.alert("A data selecionada nao esta disponivel para a profissional escolhida.");
    return;
  }

  try {
    const result = await apiRequest("/api/appointments", {
      method: "POST",
      body: bookingPayload,
    });

    await loadAvailability();
    if (state.adminPassword) {
      await loadAdminAppointments();
      renderAdminStats();
      renderAppointments();
    }

    showConfirmation(result.appointment || {
      ...bookingPayload,
      professionalName: professional.name,
      professionalWhatsapp: professional.whatsapp,
      professionalAddress: professional.address,
    });

    bookingForm.reset();
    selectProfessional(professional.id);
    setMinimumDate();
    updateBookingSummary();
  } catch (error) {
    console.error("[Flow] Failed to create booking", error);
    window.alert(error.message || "Nao foi possivel concluir o agendamento.");
  }
}

async function handleProfessionalApplicationSubmit(event) {
  event.preventDefault();

  const formData = new FormData(professionalApplicationForm);
  const payload = {
    fullName: formData.get("fullName")?.toString().trim(),
    whatsapp: formData.get("whatsapp")?.toString().trim(),
    email: formData.get("email")?.toString().trim(),
    city: formData.get("city")?.toString().trim(),
    instagram: formData.get("instagram")?.toString().trim(),
    specialties: formData.get("specialties")?.toString().trim(),
    message: formData.get("message")?.toString().trim(),
    acceptedTerms: formData.get("acceptedTerms") === "on",
    acceptedFee: formData.get("acceptedFee") === "on",
  };

  try {
    await apiRequest("/api/professional-applications", {
      method: "POST",
      body: payload,
    });

    const summaryMessage = buildProfessionalApplicationWhatsappSummary(payload);

    applicationConfirmationTitle.textContent = `${payload.fullName}, sua solicitacao foi recebida.`;
    applicationConfirmationText.textContent = state.settings.businessWhatsapp
      ? "Seu resumo de cadastro foi preparado para o WhatsApp da plataforma. Envie a mensagem para receber a orientacao de pagamento, concluir a confirmacao e permitir a mensagem de boas-vindas."
      : "Sua solicitacao foi salva no sistema. Configure o WhatsApp oficial da plataforma no painel admin para tambem receber o resumo automaticamente por WhatsApp.";
    applicationConfirmationCard?.classList.remove("hidden");

    const applicationWhatsappButton = document.getElementById("applicationWhatsappButton");
    if (applicationWhatsappButton) {
      setWhatsappLinkState(
        applicationWhatsappButton,
        state.settings.businessWhatsapp,
        summaryMessage
      );

      if (sanitizeWhatsappNumber(state.settings.businessWhatsapp)) {
        window.open(applicationWhatsappButton.href, "_blank", "noopener,noreferrer");
      }
    }

    professionalApplicationForm.reset();

    if (state.adminPassword) {
      await loadProfessionalApplications();
      renderProfessionalApplications();
    }
  } catch (error) {
    window.alert(error.message || "Nao foi possivel enviar sua solicitacao de cadastro.");
  }
}

function showConfirmation(appointment) {
  const readableDate = formatDate(appointment.appointmentDate);
  const message = buildWhatsappMessage(appointment);
  const paymentText = appointment.paymentMethod || "nao informado";
  const selectedProfessional = getSelectedProfessional();
  const professionalName = appointment.professionalName || selectedProfessional?.name || "a profissional";

  confirmationTitle.textContent = `${appointment.customerName}, sua solicitacao foi enviada para ${professionalName}.`;
  confirmationText.textContent =
    `${appointment.massageType} em ${readableDate} as ${appointment.appointmentTime}. ` +
    `Pagamento escolhido: ${paymentText}. ` +
    `Envie o comprovante diretamente para o WhatsApp da profissional para concluir a confirmacao.`;

  setWhatsappLinkState(
    confirmationWhatsappLink,
    appointment.professionalWhatsapp || selectedProfessional?.whatsapp || state.settings.businessWhatsapp,
    message
  );
  confirmationCard.classList.remove("hidden");
  confirmationCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderProfessionalCards() {
  professionalCards.innerHTML = "";
  const selectedProfessional = getSelectedProfessional();

  if (!state.settings.professionals.length) {
    professionalCards.innerHTML = `
      <article class="empty-state-card luxury-frame">
        <div class="empty-state-copy">
          <span class="section-kicker">Em breve</span>
          <h4>As profissionais ainda nao foram cadastradas.</h4>
          <p>Este espaco foi preparado para receber os perfis, agendas, galerias e servicos assim que voce adicionar a primeira profissional no painel admin.</p>
        </div>
      </article>
    `;
    return;
  }

  state.settings.professionals.forEach((professional) => {
    const article = document.createElement("article");
    article.className = `professional-card luxury-frame${professional.id === selectedProfessional.id ? " is-selected" : ""}`;
    article.innerHTML = `
      <button class="professional-card-button" type="button" data-professional-id="${escapeHtml(professional.id)}">
        <img src="${escapeHtml(professional.photo || fallbackProfessionalImage())}" alt="${escapeHtml(professional.name)}" />
        <div class="professional-card-content">
          <span class="service-tag">${escapeHtml(professional.role)}</span>
          <h4>${escapeHtml(professional.name)}</h4>
          <p>${escapeHtml(professional.bio || "Atendimento personalizado.")}</p>
          <div class="professional-meta">
            <span>${escapeHtml(professional.neighborhood || professional.city || "Atendimento local")}</span>
            <span>${escapeHtml(formatWeekdayList(professional.allowedWeekdays))}</span>
          </div>
        </div>
      </button>
    `;
    professionalCards.appendChild(article);
  });

  professionalCards.querySelectorAll("[data-professional-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectProfessional(button.dataset.professionalId || "", { scrollToBooking: true });
    });
  });
}

function renderSelectedProfessionalPanel() {
  const professional = getSelectedProfessional();
  if (!professional) {
    selectedProfessionalPanel.innerHTML = `
      <div class="empty-state-copy">
        <span class="section-kicker">Perfil indisponivel</span>
        <h3>Nenhuma profissional cadastrada ainda.</h3>
        <p>Assim que voce adicionar a primeira profissional no painel administrativo, esta area vai mostrar foto, galeria, detalhes dos servicos, regras de atendimento e agenda individual.</p>
      </div>
    `;
    return;
  }
  const servicesMarkup = professional.services
    .map(
      (service) => `
        <div class="selected-service-row">
          <strong>${escapeHtml(service.name)}</strong>
          <span>${escapeHtml(service.duration)} - ${escapeHtml(formatCurrency(service.price))}</span>
        </div>
      `
    )
    .join("");
  const specialtiesMarkup = professional.specialties
    .map((specialty) => `<span class="specialty-chip">${escapeHtml(specialty)}</span>`)
    .join("");
  const photosMarkup = (professional.galleryPhotos || [])
    .slice(0, 6)
    .map((url) => `<img src="${escapeHtml(url)}" alt="Galeria de ${escapeHtml(professional.name)}" />`)
    .join("");
  const videosMarkup = (professional.galleryVideos || [])
    .slice(0, 2)
    .map((url) => renderVideoEmbed(url, professional.name))
    .join("");
  const boundariesMarkup = (professional.boundaries || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  selectedProfessionalPanel.innerHTML = `
    <div class="selected-professional-media">
      <img src="${escapeHtml(professional.photo || fallbackProfessionalImage())}" alt="${escapeHtml(professional.name)}" />
    </div>
    <div class="selected-professional-copy">
      <span class="section-kicker">Profissional selecionada</span>
      <h3>${escapeHtml(professional.name)}</h3>
      <p class="professional-role">${escapeHtml(professional.role)}</p>
      <p>${escapeHtml(professional.bio || "Atendimento personalizado e humano.")}</p>
      <div class="selected-professional-block">
        <strong>Endereco</strong>
        <p>${escapeHtml(buildProfessionalAddress(professional))}</p>
      </div>
      <div class="selected-professional-block">
        <strong>Agenda</strong>
        <p>${escapeHtml(formatWeekdayList(professional.allowedWeekdays))} - ${escapeHtml(professional.timeSlots.join(", "))}</p>
      </div>
      <div class="selected-professional-block">
        <strong>Pagamento</strong>
        <p>${escapeHtml(professional.paymentMethods.join(", "))}</p>
      </div>
      <div class="selected-professional-block">
        <strong>Detalhes do atendimento</strong>
        <p>${escapeHtml(professional.serviceDetails || "Consulte a profissional para mais detalhes sobre tecnicas, ambiente e preparacao para a sessao.")}</p>
      </div>
      <div class="selected-professional-block">
        <strong>Limites e regras de atendimento</strong>
        <ul class="boundaries-list">${boundariesMarkup}</ul>
      </div>
      <div class="specialties-row">${specialtiesMarkup}</div>
      <div class="selected-services-list">${servicesMarkup}</div>
      ${photosMarkup ? `<div class="professional-gallery-grid">${photosMarkup}</div>` : ""}
      ${videosMarkup ? `<div class="professional-video-grid">${videosMarkup}</div>` : ""}
    </div>
  `;
}

function renderProfessionalOptions() {
  professionalSelector.innerHTML = "";
  const selectedProfessional = getSelectedProfessional();

  if (!state.settings.professionals.length) {
    professionalSelector.innerHTML = '<div class="field-note">Nenhuma profissional cadastrada no momento.</div>';
    return;
  }

  state.settings.professionals.forEach((professional) => {
    const label = document.createElement("label");
    label.className = "radio-card";
    label.innerHTML = `
      <input type="radio" name="professionalId" value="${escapeHtml(professional.id)}" ${professional.id === selectedProfessional.id ? "checked" : ""} required>
      <div class="radio-card-content">
        <span>${escapeHtml(professional.name)}</span>
        <strong>${escapeHtml(professional.role)}</strong>
      </div>
    `;
    professionalSelector.appendChild(label);
  });
}

function renderServiceOptions() {
  const professional = getSelectedProfessional();
  if (!professional) {
    massageTypeField.innerHTML = '<div class="field-note">Os servicos aparecerao quando a primeira profissional for cadastrada.</div>';
    return;
  }
  const previousValue = getRadioValue("massageType");
  massageTypeField.innerHTML = "";

  professional.services.forEach((service) => {
    const label = document.createElement("label");
    label.className = "radio-card";
    label.innerHTML = `
      <input type="radio" name="massageType" value="${escapeHtml(service.name)}" required>
      <div class="radio-card-content">
        <span>${escapeHtml(service.name)}</span>
        <strong>${escapeHtml(service.duration)} - ${escapeHtml(formatCurrency(service.price))}</strong>
      </div>
    `;
    massageTypeField.appendChild(label);
  });

  const preferredServiceName = professional.services.some((service) => service.name === previousValue)
    ? previousValue
    : professional.services[0]?.name;
  if (preferredServiceName) {
    const radio = massageTypeField.querySelector(`input[value="${cssEscape(preferredServiceName)}"]`);
    if (radio) {
      radio.checked = true;
    }
  }
}

function renderPaymentMethodOptions() {
  const professional = getSelectedProfessional();
  if (!professional) {
    paymentMethodField.innerHTML = '<div class="field-note">As formas de pagamento aparecerao quando houver profissional cadastrada.</div>';
    return;
  }
  const previousValue = getRadioValue("paymentMethod");
  paymentMethodField.innerHTML = "";

  professional.paymentMethods.forEach((method) => {
    const label = document.createElement("label");
    label.className = "radio-card";
    label.innerHTML = `
      <input type="radio" name="paymentMethod" value="${escapeHtml(method)}" required>
      <div class="radio-card-content">${escapeHtml(method)}</div>
    `;
    paymentMethodField.appendChild(label);
  });

  const preferredMethod = professional.paymentMethods.includes(previousValue)
    ? previousValue
    : professional.paymentMethods[0];
  if (preferredMethod) {
    const radio = paymentMethodField.querySelector(`input[value="${cssEscape(preferredMethod)}"]`);
    if (radio) {
      radio.checked = true;
    }
  }
}

function renderTimeOptions() {
  const selectedDate = dateField.value;
  const professional = getSelectedProfessional();
  if (!professional) {
    timeField.innerHTML = '<div class="field-note">Os horarios aparecerao quando houver profissional cadastrada.</div>';
    return;
  }
  const previousValue = getRadioValue("appointmentTime");

  if (selectedDate && !isDateSelectable(selectedDate)) {
    timeField.innerHTML = '<div class="field-note">Selecione uma data valida para esta profissional.</div>';
    return;
  }

  const occupiedTimes = new Set(
    getAvailabilityArray()
      .filter(
        (item) =>
          item.professionalId === professional.id &&
          item.appointmentDate === selectedDate &&
          item.status !== "cancelled"
      )
      .map((item) => item.appointmentTime)
  );

  timeField.innerHTML = "";

  professional.timeSlots.forEach((time) => {
    const isBooked = occupiedTimes.has(time);
    const label = document.createElement("label");
    label.className = "radio-card";
    label.innerHTML = `
      <input type="radio" name="appointmentTime" value="${escapeHtml(time)}" required ${isBooked ? "disabled" : ""}>
      <div class="radio-card-content">${escapeHtml(time)}</div>
    `;
    timeField.appendChild(label);
  });

  if (previousValue && !occupiedTimes.has(previousValue)) {
    const radio = timeField.querySelector(`input[value="${cssEscape(previousValue)}"]`);
    if (radio) {
      radio.checked = true;
    }
  }
}

function refreshProfessionalAddressField() {
  const professional = getSelectedProfessional();
  professionalAddressDisplay.value = professional ? buildProfessionalAddress(professional) : "A definir";
}

function updateWeekdaysNote() {
  const professional = getSelectedProfessional();
  selectedWeekdaysNote.textContent = professional
    ? `Dias de atendimento: ${formatWeekdayList(professional.allowedWeekdays)}.`
    : "Cadastre a primeira profissional para liberar agenda e datas.";
}

function renderAppointments() {
  appointmentsList.innerHTML = "";
  const filteredAppointments = getFilteredAppointments();

  if (!filteredAppointments.length) {
    appointmentsList.innerHTML =
      '<div class="appointment-item"><div class="appointment-item-copy"><h5>Nenhuma solicitacao encontrada</h5><p>Ajuste os filtros ou aguarde novos pedidos.</p></div></div>';
    return;
  }

  filteredAppointments.forEach((appointment) => {
    const item = document.createElement("article");
    item.className = "appointment-item";
    item.innerHTML = `
      <div class="appointment-item-copy">
        <div class="appointment-item-meta">
          <div class="appointment-payment-row">
            <span class="status-chip ${getStatusClassName(appointment.status)}">${escapeHtml(getStatusLabel(appointment.status))}</span>
            <span class="status-chip ${getPaymentStatusClassName(appointment.paymentStatus)}">${escapeHtml(getPaymentStatusLabel(appointment.paymentStatus))}</span>
          </div>
          <h5>${escapeHtml(appointment.customerName)} - ${escapeHtml(appointment.professionalName || "Profissional")}</h5>
          <p>${escapeHtml(appointment.massageType)} em ${escapeHtml(formatDate(appointment.appointmentDate))} as ${escapeHtml(appointment.appointmentTime)}</p>
          <p>Local: ${escapeHtml(appointment.serviceRegion || appointment.professionalAddress || "Nao informado")}</p>
          <p>Pagamento: ${escapeHtml(appointment.paymentMethod)} - ${escapeHtml(formatCurrency(appointment.amount || 0))}</p>
          <p>WhatsApp cliente: ${escapeHtml(appointment.customerPhone)}</p>
          <p>WhatsApp profissional: ${escapeHtml(appointment.professionalWhatsapp || "")}</p>
          <p>${escapeHtml(appointment.customerNotes || "Sem observacoes adicionais.")}</p>
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
}

async function handleAppointmentAction(action, appointmentId) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  if (!appointment) {
    return;
  }

  if (action === "whatsapp") {
    window.open(
      buildWhatsappUrl(appointment.professionalWhatsapp, buildWhatsappMessage(appointment)),
      "_blank",
      "noopener,noreferrer"
    );
    return;
  }

  await updateAppointment(appointmentId, {
    status:
      action === "cancel"
        ? "cancelled"
        : action === "confirm" || action === "paid"
          ? "confirmed"
          : appointment.status,
    paymentStatus: action === "paid" ? "paid" : appointment.paymentStatus,
  });
}

function renderAdminStats() {
  const total = state.appointments.length;
  const confirmed = state.appointments.filter((item) => item.status === "confirmed").length;
  const awaitingPayment = state.appointments.filter((item) => item.status === "pending_payment").length;
  const cancelled = state.appointments.filter((item) => item.status === "cancelled").length;
  const paid = state.appointments.filter((item) => item.paymentStatus === "paid").length;
  const applications = getProfessionalApplicationsArray();
  const activePartners = applications.filter((item) => item.subscriptionStatus === "active").length;
  const overduePartners = applications.filter((item) => item.subscriptionStatus === "overdue").length;
  const blockedPartners = applications.filter((item) => item.subscriptionStatus === "blocked").length;

  adminStats.innerHTML = `
    <article><strong>${total}</strong><span>Total de pedidos</span></article>
    <article><strong>${confirmed}</strong><span>Confirmados</span></article>
    <article><strong>${awaitingPayment}</strong><span>Aguardando comprovante</span></article>
    <article><strong>${cancelled}</strong><span>Cancelados</span></article>
    <article><strong>${paid}</strong><span>Pagos</span></article>
    <article><strong>${state.settings.professionals.length}</strong><span>Profissionais ativas</span></article>
    <article><strong>${activePartners}</strong><span>Assinaturas ativas</span></article>
    <article><strong>${overduePartners}</strong><span>Parceiras em atraso</span></article>
    <article><strong>${blockedPartners}</strong><span>Parceiras bloqueadas</span></article>
  `;
}

function openAdminModal() {
  adminLogin.classList.remove("hidden");
  adminContent.classList.add("hidden");
  hydrateSettingsFields();
  adminModal.classList.remove("hidden");
}

function closeAdminModal() {
  adminModal.classList.add("hidden");
  adminLogin.classList.remove("hidden");
  adminContent.classList.add("hidden");
  adminPasswordField.value = "";
}

async function handleAdminLogin() {
  state.adminPassword = adminPasswordField.value.trim();
  if (!state.adminPassword) {
    window.alert("Informe a senha administrativa.");
    return;
  }

  try {
    await loadAdminAppointments();
    await loadProfessionalApplications();
    renderAdminStats();
    renderAppointments();
    renderProfessionalApplications();
    adminLogin.classList.add("hidden");
    adminContent.classList.remove("hidden");
  } catch (error) {
    window.alert(error.message || "Nao foi possivel entrar no painel.");
  }
}

async function saveSettings() {
  const professionals = collectProfessionalsFromEditor();

  const payload = {
    businessWhatsapp: sanitizeWhatsappNumber(getFieldValue(businessWhatsappField)),
    mercadoPagoCheckout: "",
    pixKey: getFieldValue(pixKeyField).trim(),
    businessAddress: getFieldValue(businessAddressField).trim(),
    blockedDates: parseBlockedDates(getFieldValue(blockedDatesConfigField)),
    professionals,
    services: [],
    timeSlots: [],
    paymentMethods: [],
    allowedWeekdays: [],
  };

  try {
    state.settings = normalizeSettings(
      await apiRequest("/api/settings", {
        method: "PUT",
        includeAdminPassword: true,
        body: payload,
      })
    );
    hydrateSettingsFields();
    renderPublicUi();
    if (state.adminPassword) {
      await loadAdminAppointments();
      renderAdminStats();
      renderAppointments();
    }
    window.alert("Configuracoes salvas com sucesso.");
  } catch (error) {
    window.alert(error.message || "Nao foi possivel salvar as configuracoes.");
  }
}

function hydrateSettingsFields() {
  setFieldValue(businessWhatsappField, state.settings.businessWhatsapp);
  setFieldValue(pixKeyField, state.settings.pixKey);
  setFieldValue(businessAddressField, state.settings.businessAddress);
  setFieldValue(blockedDatesConfigField, state.settings.blockedDates.join("\n"));
  renderProfessionalsEditor();
  syncProfessionalsPreviewFromEditor();
}

function renderProfessionalApplications() {
  if (!professionalApplicationsList) {
    return;
  }

  const applications = getFilteredProfessionalApplications();
  professionalApplicationsList.innerHTML = "";

  if (!applications.length) {
    professionalApplicationsList.innerHTML =
      '<div class="appointment-item"><div class="appointment-item-copy"><h5>Nenhuma solicitacao de cadastro</h5><p>Quando uma profissional preencher o formulario publico, ela aparecera aqui.</p></div></div>';
    return;
  }

  applications.forEach((application) => {
    const item = document.createElement("article");
    item.className = "appointment-item";
    item.innerHTML = `
      <div class="appointment-item-copy">
        <div class="appointment-item-meta">
          <div class="appointment-payment-row">
            <span class="status-chip ${getProfessionalApplicationStatusClassName(application.status)}">${escapeHtml(getProfessionalApplicationStatusLabel(application.status))}</span>
          </div>
          <h5>${escapeHtml(application.fullName)}</h5>
          <p>Enviado em: ${escapeHtml(formatDateTime(application.createdAt))}</p>
          <p>Mensalidade: ${escapeHtml(formatCurrency(application.monthlyFee || 150))}</p>
          <p>Assinatura: ${escapeHtml(getProfessionalApplicationSubscriptionLabel(application.subscriptionStatus))}</p>
          <p>Pagamento confirmado em: ${escapeHtml(formatDateTime(application.paymentConfirmedAt))}</p>
          <p>Proximo vencimento: ${escapeHtml(formatShortDate(application.nextDueDate))}</p>
          <p>Bloqueio em: ${escapeHtml(formatDateTime(application.blockedAt))}</p>
          <p>WhatsApp: ${escapeHtml(application.whatsapp)}</p>
          <p>E-mail: ${escapeHtml(application.email || "Nao informado")}</p>
          <p>Cidade: ${escapeHtml(application.city || "Nao informado")}</p>
          <p>Instagram: ${escapeHtml(application.instagram || "Nao informado")}</p>
          <p>Especialidades: ${escapeHtml(application.specialties || "Nao informado")}</p>
          <p>${escapeHtml(application.message || "Sem mensagem adicional.")}</p>
          <p>Aceitou regras: ${application.acceptedTerms ? "Sim" : "Nao"} - Aceitou mensalidade: ${application.acceptedFee ? "Sim" : "Nao"}</p>
          <label class="full-width">
            <span class="field-note">Observacoes internas</span>
            <textarea data-application-note="${application.id}" rows="3" placeholder="Contato feito, comprovante recebido, pendencias, observacoes comerciais">${escapeHtml(application.internalNotes || "")}</textarea>
          </label>
        </div>
      </div>
      <div class="appointment-item-actions">
        <a class="secondary-button" href="${buildWhatsappUrl(application.whatsapp, `Ola ${application.fullName}, recebemos sua solicitacao de cadastro na ${BRAND_NAME}.`)}" target="_blank" rel="noreferrer">WhatsApp</a>
        <button class="secondary-button" data-application-action="welcome" data-id="${application.id}" type="button">Boas-vindas</button>
        <button class="secondary-button" data-application-status="pending" data-id="${application.id}" type="button">Pendente</button>
        <button class="secondary-button" data-application-status="in_contact" data-id="${application.id}" type="button">Em contato</button>
        <button class="secondary-button" data-application-status="approved" data-id="${application.id}" type="button">Aprovar</button>
        <button class="ghost-button" data-application-status="blocked" data-id="${application.id}" type="button">Bloquear</button>
        <button class="secondary-button" data-application-action="payment_confirmed" data-id="${application.id}" type="button">Pagamento ok</button>
        <button class="secondary-button" data-application-action="mark_overdue" data-id="${application.id}" type="button">Marcar atraso</button>
        <button class="secondary-button" data-application-action="create_profile" data-id="${application.id}" type="button">Criar perfil</button>
        <button class="ghost-button" data-application-action="save_note" data-id="${application.id}" type="button">Salvar observacao</button>
      </div>
    `;
    professionalApplicationsList.appendChild(item);
  });

  professionalApplicationsList.querySelectorAll("button[data-application-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleProfessionalApplicationAction(button.dataset.applicationStatus, button.dataset.id);
    });
  });

  professionalApplicationsList.querySelectorAll("button[data-application-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleProfessionalApplicationUiAction(button.dataset.applicationAction, button.dataset.id);
    });
  });
}

async function handleProfessionalApplicationAction(nextStatus, applicationId) {
  const application = state.professionalApplications.find((item) => item.id === applicationId);
  if (!application || application.status === nextStatus) {
    return;
  }

  await updateProfessionalApplication(applicationId, {
    status: nextStatus,
  });
}

async function handleProfessionalApplicationUiAction(action, applicationId) {
  const application = state.professionalApplications.find((item) => item.id === applicationId);
  if (!application) {
    return;
  }

  if (action === "create_profile") {
    createProfessionalFromApplication(application);
    return;
  }

  if (action === "welcome") {
    window.open(
      buildWhatsappUrl(application.whatsapp, buildProfessionalWelcomeMessage(application)),
      "_blank",
      "noopener,noreferrer"
    );
    return;
  }

  if (action === "save_note") {
    const noteField = professionalApplicationsList.querySelector(`textarea[data-application-note="${applicationId}"]`);
    await updateProfessionalApplication(applicationId, {
      internalNotes: noteField ? noteField.value.trim() : "",
    });
    return;
  }

  await updateProfessionalApplication(applicationId, {
    action,
  });
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
  } catch (error) {
    window.alert(error.message || "Nao foi possivel remover os cancelados.");
  }
}

function refreshWhatsappLinks() {
  const selectedProfessional = getSelectedProfessional();
  const genericMessage = selectedProfessional
    ? `Ola, gostaria de saber mais sobre os atendimentos da ${selectedProfessional.name}.`
    : `Ola, gostaria de saber mais sobre os atendimentos da ${BRAND_NAME}.`;
  const contactPhone = selectedProfessional?.whatsapp || state.settings.businessWhatsapp;

  setWhatsappLinkState(document.getElementById("heroWhatsappButton"), contactPhone, genericMessage);
  setWhatsappLinkState(document.getElementById("formWhatsappButton"), contactPhone, genericMessage);
  setWhatsappLinkState(document.getElementById("floatingWhatsappButton"), contactPhone, genericMessage);
  refreshApplicationWhatsappLink();
}

function handleFiltersChange() {
  state.filters.search = appointmentSearchField.value.trim().toLowerCase();
  state.filters.status = appointmentStatusFilterField.value;
  state.filters.paymentStatus = paymentStatusFilterField.value;
  state.filters.applicationSearch = applicationSearchField?.value.trim().toLowerCase() || "";
  state.filters.applicationStatus = applicationStatusFilterField?.value || "all";
  state.filters.subscriptionStatus = subscriptionStatusFilterField?.value || "all";
  renderAppointments();
  renderProfessionalApplications();
}

function getFilteredAppointments() {
  return getAppointmentsArray().filter((appointment) => {
    const matchesSearch =
      !state.filters.search ||
      appointment.customerName.toLowerCase().includes(state.filters.search) ||
      appointment.professionalName.toLowerCase().includes(state.filters.search) ||
      appointment.customerPhone.toLowerCase().includes(state.filters.search);

    const matchesStatus =
      state.filters.status === "all" || appointment.status === state.filters.status;

    const matchesPaymentStatus =
      state.filters.paymentStatus === "all" ||
      (appointment.paymentStatus || "pending") === state.filters.paymentStatus;

    return matchesSearch && matchesStatus && matchesPaymentStatus;
  });
}

function getFilteredProfessionalApplications() {
  return getProfessionalApplicationsArray().filter((application) => {
    const searchText = [
      application.fullName,
      application.whatsapp,
      application.email,
      application.city,
      application.instagram,
      application.specialties,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = !state.filters.applicationSearch || searchText.includes(state.filters.applicationSearch);
    const matchesStatus =
      state.filters.applicationStatus === "all" || application.status === state.filters.applicationStatus;
    const matchesSubscription =
      state.filters.subscriptionStatus === "all" ||
      application.subscriptionStatus === state.filters.subscriptionStatus;

    return matchesSearch && matchesStatus && matchesSubscription;
  });
}

function exportAppointments() {
  downloadJson(state.appointments, "flow-terapias-agendamentos.json");
}

function exportServedClients() {
  downloadJson(
    state.appointments.filter((appointment) => appointment.status === "confirmed"),
    "flow-terapias-atendimentos-confirmados.json"
  );
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function loadPublicData() {
  await loadSettings();
  await loadAvailability();
  renderPublicUi();
}

async function loadSettings() {
  const apiSettings = await apiRequest("/api/settings");
  state.settings = normalizeSettings(apiSettings);
  if (!state.settings.professionals.some((item) => item.id === state.selectedProfessionalId)) {
    state.selectedProfessionalId = state.settings.professionals[0]?.id || "";
  }
  return state.settings;
}

async function loadAvailability() {
  state.availability = await apiRequest("/api/appointments/availability");
  return state.availability;
}

async function loadAdminAppointments() {
  state.appointments = await apiRequest("/api/appointments", {
    includeAdminPassword: true,
  });
  return state.appointments;
}

async function loadProfessionalApplications() {
  state.professionalApplications = await apiRequest("/api/professional-applications", {
    includeAdminPassword: true,
  });
  return state.professionalApplications;
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

async function updateProfessionalApplication(applicationId, payload) {
  await apiRequest(`/api/professional-applications/${applicationId}`, {
    method: "PATCH",
    includeAdminPassword: true,
    body: payload,
  });
  await loadProfessionalApplications();
  renderProfessionalApplications();
}

function renderPublicUi() {
  renderSelectedProfessionalState();
}

function refreshApplicationWhatsappLink() {
  const button = document.getElementById("applicationWhatsappButton");
  if (!button) {
    return;
  }

  setWhatsappLinkState(
    button,
    state.settings.businessWhatsapp,
    `Ola, tenho interesse em me cadastrar como profissional na plataforma ${BRAND_NAME}. Gostaria de receber as orientacoes sobre regras, mensalidade e confirmacao do pagamento.`
  );
}

function createProfessionalFromApplication(application) {
  const professionalDraft = createEmptyProfessional(state.settings.professionals.length + 1);
  professionalDraft.id = sanitizeSlug(application.fullName || `profissional-${Date.now()}`) || `profissional-${Date.now()}`;
  professionalDraft.name = application.fullName || "";
  professionalDraft.role = "Profissional parceira";
  professionalDraft.whatsapp = sanitizeWhatsappNumber(application.whatsapp);
  professionalDraft.city = application.city || "";
  professionalDraft.bio = application.message || "";
  professionalDraft.specialties = parseCommaSeparatedList(application.specialties || "");
  professionalDraft.serviceDetails =
    "Perfil criado a partir da solicitacao publica. Complete servicos, agenda, endereco, pagamentos e galeria antes de publicar.";

  const editorCard = buildProfessionalEditorCard(professionalDraft);
  professionalsEditor.appendChild(editorCard);
  syncProfessionalsPreviewFromEditor();
  editorCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

function handleAddProfessional() {
  const editorCard = buildProfessionalEditorCard(createEmptyProfessional(state.settings.professionals.length + 1));
  professionalsEditor.appendChild(editorCard);
  syncProfessionalsPreviewFromEditor();
  editorCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function handleProfessionalEditorActions(event) {
  const actionButton = event.target.closest("[data-professional-editor-action]");
  if (!actionButton) {
    return;
  }

  const card = actionButton.closest(".professional-editor-card");
  if (!card) {
    return;
  }

  if (actionButton.dataset.professionalEditorAction === "remove") {
    card.remove();
    syncProfessionalsPreviewFromEditor();
  }

  if (actionButton.dataset.professionalEditorAction === "duplicate") {
    const professional = readProfessionalFromCard(card);
    const copy = {
      ...professional,
      id: `${professional.id || "profissional"}-copia`,
      name: professional.name ? `${professional.name} Copia` : "Nova profissional",
    };
    card.insertAdjacentElement("afterend", buildProfessionalEditorCard(copy));
    syncProfessionalsPreviewFromEditor();
  }
}

function renderProfessionalsEditor() {
  if (!professionalsEditor) {
    return;
  }

  professionalsEditor.innerHTML = "";
  state.settings.professionals.forEach((professional) => {
    professionalsEditor.appendChild(buildProfessionalEditorCard(professional));
  });
}

function buildProfessionalEditorCard(professional) {
  const article = document.createElement("article");
  article.className = "professional-editor-card luxury-frame";
  article.innerHTML = `
    <div class="professional-editor-head">
      <div>
        <span class="section-kicker">Perfil profissional</span>
        <h4>${escapeHtml(professional.name || "Nova profissional")}</h4>
      </div>
      <div class="admin-inline-actions">
        <button class="secondary-button" data-professional-editor-action="duplicate" type="button">Duplicar</button>
        <button class="ghost-button" data-professional-editor-action="remove" type="button">Remover</button>
      </div>
    </div>
    <div class="form-grid compact-grid">
      <label>
        ID publico
        <input data-professional-field="id" type="text" value="${escapeAttribute(professional.id || "")}" placeholder="ana-cristina" />
      </label>
      <label>
        Nome
        <input data-professional-field="name" type="text" value="${escapeAttribute(professional.name || "")}" placeholder="Ana Cristina" />
      </label>
      <label>
        Cargo ou chamada
        <input data-professional-field="role" type="text" value="${escapeAttribute(professional.role || "")}" placeholder="Massoterapeuta especialista em relaxamento" />
      </label>
      <label>
        WhatsApp
        <input data-professional-field="whatsapp" type="text" value="${escapeAttribute(professional.whatsapp || "")}" placeholder="5542999999999" />
      </label>
      <label>
        Endereco
        <input data-professional-field="address" type="text" value="${escapeAttribute(professional.address || "")}" placeholder="Rua Exemplo, 123" />
      </label>
      <label>
        Bairro
        <input data-professional-field="neighborhood" type="text" value="${escapeAttribute(professional.neighborhood || "")}" placeholder="Centro" />
      </label>
      <label>
        Cidade
        <input data-professional-field="city" type="text" value="${escapeAttribute(professional.city || "")}" placeholder="Ponta Grossa - PR" />
      </label>
      <label>
        Foto (URL)
        <input data-professional-field="photo" type="url" value="${escapeAttribute(professional.photo || "")}" placeholder="https://..." />
      </label>
      <label class="full-width">
        Fotos do perfil
        <textarea data-professional-field="galleryPhotos" rows="4" placeholder="Uma URL por linha, ate 6 fotos">${escapeHtml((professional.galleryPhotos || []).join("\n"))}</textarea>
      </label>
      <label class="full-width">
        Videos do perfil
        <textarea data-professional-field="galleryVideos" rows="3" placeholder="Uma URL por linha, ate 2 videos">${escapeHtml((professional.galleryVideos || []).join("\n"))}</textarea>
      </label>
      <label class="full-width">
        Bio comercial
        <textarea data-professional-field="bio" rows="3" placeholder="Resumo do estilo de atendimento e do diferencial da profissional">${escapeHtml(professional.bio || "")}</textarea>
      </label>
      <label class="full-width">
        Detalhes dos servicos
        <textarea data-professional-field="serviceDetails" rows="4" placeholder="Explique tecnicas, foco do atendimento, ambiente, preparacao e observacoes relevantes">${escapeHtml(professional.serviceDetails || "")}</textarea>
      </label>
      <label class="full-width">
        Especialidades
        <textarea data-professional-field="specialties" rows="2" placeholder="Massagem relaxante, drenagem, aromaterapia">${escapeHtml((professional.specialties || []).join(", "))}</textarea>
      </label>
      <label class="full-width">
        Limites e regras de atendimento
        <textarea data-professional-field="boundaries" rows="4" placeholder="Uma regra por linha">${escapeHtml((professional.boundaries || DEFAULT_BOUNDARY_OPTIONS).join("\n"))}</textarea>
      </label>
      <label class="full-width">
        Servicos
        <textarea data-professional-field="services" rows="5" placeholder="Massagem Relaxante Premium|60 min|140&#10;Drenagem Linfatica|60 min|160">${escapeHtml(serializeServices(professional.services))}</textarea>
      </label>
      <label>
        Horarios
        <textarea data-professional-field="timeSlots" rows="3" placeholder="09:00,10:30,13:30">${escapeHtml((professional.timeSlots || []).join(", "))}</textarea>
      </label>
      <label>
        Formas de pagamento
        <textarea data-professional-field="paymentMethods" rows="3" placeholder="Pix, Transferencia, Dinheiro no atendimento">${escapeHtml((professional.paymentMethods || []).join(", "))}</textarea>
      </label>
      <label class="full-width">
        Dias de atendimento
        <div class="weekday-checkboxes">
          ${WEEKDAY_LABELS.map((label, dayIndex) => `
            <label class="weekday-check">
              <input data-professional-field="allowedWeekdays" type="checkbox" value="${dayIndex}" ${(professional.allowedWeekdays || []).includes(dayIndex) ? "checked" : ""} />
              <span>${label}</span>
            </label>
          `).join("")}
        </div>
      </label>
    </div>
  `;
  return article;
}

function collectProfessionalsFromEditor() {
  const cards = professionalsEditor ? [...professionalsEditor.querySelectorAll(".professional-editor-card")] : [];
  return cards
    .map((card) => readProfessionalFromCard(card))
    .filter(
      (professional) =>
        professional.id &&
        professional.name &&
        professional.whatsapp &&
        professional.services.length &&
        professional.timeSlots.length &&
        professional.paymentMethods.length &&
        professional.allowedWeekdays.length
    );
}

function readProfessionalFromCard(card) {
  const getValue = (field) =>
    String(card.querySelector(`[data-professional-field="${field}"]`)?.value || "").trim();
  const allowedWeekdays = [...card.querySelectorAll('[data-professional-field="allowedWeekdays"]:checked')]
    .map((input) => Number(input.value))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  return {
    id: sanitizeSlug(getValue("id") || getValue("name")),
    name: getValue("name"),
    role: getValue("role"),
    whatsapp: sanitizeWhatsappNumber(getValue("whatsapp")),
    address: getValue("address"),
    neighborhood: getValue("neighborhood"),
    city: getValue("city"),
    photo: getValue("photo"),
    galleryPhotos: parseLineSeparatedList(getValue("galleryPhotos")).slice(0, 6),
    galleryVideos: parseLineSeparatedList(getValue("galleryVideos")).slice(0, 2),
    bio: getValue("bio"),
    serviceDetails: getValue("serviceDetails"),
    specialties: parseCommaSeparatedList(getValue("specialties")),
    boundaries: parseLineSeparatedList(getValue("boundaries")),
    services: parseServicesTextarea(getValue("services")),
    timeSlots: parseCommaSeparatedList(getValue("timeSlots")).filter((slot) => /^\d{2}:\d{2}$/.test(slot)),
    paymentMethods: parseCommaSeparatedList(getValue("paymentMethods")),
    allowedWeekdays,
  };
}

function syncProfessionalsPreviewFromEditor() {
  const professionals = collectProfessionalsFromEditor();
  setFieldValue(professionalsCatalogField, JSON.stringify(professionals, null, 2));

  const nameFields = professionalsEditor ? professionalsEditor.querySelectorAll('[data-professional-field="name"]') : [];
  const cards = professionalsEditor ? professionalsEditor.querySelectorAll(".professional-editor-card") : [];
  nameFields.forEach((input, index) => {
    const title = cards[index]?.querySelector(".professional-editor-head h4");
    if (title) {
      title.textContent = input.value.trim() || "Nova profissional";
    }
  });
}

function setMinimumDate() {
  const today = new Date();
  dateField.min = today.toISOString().split("T")[0];
}

function enforceBusinessDaySelection() {
  if (!dateField.value || isDateSelectable(dateField.value)) {
    return;
  }

  dateField.value = "";
  timeField.innerHTML = "";
  updateBookingSummary();
  window.alert("Selecione uma data disponivel para a profissional escolhida.");
}

function isDateSelectable(dateString) {
  if (!dateString) {
    return false;
  }

  const professional = getSelectedProfessional();
  if (!professional) {
    return false;
  }
  const date = new Date(`${dateString}T00:00:00`);
  return professional.allowedWeekdays.includes(date.getDay()) && !state.settings.blockedDates.includes(dateString);
}

function buildWhatsappMessage(appointment) {
  const professional = getSelectedProfessional();
  if (!professional && !appointment.professionalName) {
    return `Ola, gostaria de saber mais sobre os atendimentos da ${BRAND_NAME}.`;
  }
  const professionalName = appointment.professionalName || professional.name;
  const professionalAddress = appointment.professionalAddress || professional.address;
  return (
    `Ola ${professionalName}, acabei de solicitar meu atendimento pelo site ${BRAND_NAME}. ` +
    `Cliente: ${appointment.customerName}. ` +
    `Servico: ${appointment.massageType}. ` +
    `Data: ${formatDate(appointment.appointmentDate)} as ${appointment.appointmentTime}. ` +
    `Pagamento: ${appointment.paymentMethod}. ` +
    `Local informado: ${appointment.serviceRegion || professionalAddress}. ` +
    `Vou enviar meu comprovante por aqui.`
  );
}

function buildProfessionalApplicationWhatsappSummary(payload) {
  return [
    `Ola, uma nova candidata concluiu o cadastro na plataforma ${BRAND_NAME}.`,
    `Nome: ${payload.fullName || "Nao informado"}`,
    `WhatsApp: ${payload.whatsapp || "Nao informado"}`,
    `E-mail: ${payload.email || "Nao informado"}`,
    `Cidade: ${payload.city || "Nao informado"}`,
    `Instagram: ${payload.instagram || "Nao informado"}`,
    `Especialidades: ${payload.specialties || "Nao informado"}`,
    `Apresentacao: ${payload.message || "Nao informada"}`,
    "Aceites confirmados: regras da plataforma e mensalidade de R$ 150,00.",
    "Use esta mensagem para dar boas-vindas, agradecer e orientar o pagamento/confirmacao.",
  ].join(" ");
}

function buildProfessionalWelcomeMessage(application) {
  return [
    `Ola ${application.fullName || ""}, seja muito bem-vinda a ${BRAND_NAME}.`,
    "Recebemos seu cadastro e agradecemos pelo interesse em fazer parte da plataforma.",
    "Seu perfil esta em processo de onboarding comercial e vamos orientar os proximos passos por aqui.",
    "Conte conosco para alinhar mensalidade, confirmacao e publicacao do perfil.",
  ].join(" ");
}

function buildWhatsappUrl(phone, message) {
  const sanitizedPhone = sanitizeWhatsappNumber(phone);
  if (!sanitizedPhone) {
    return "#";
  }
  return `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(message)}`;
}

function sanitizeWhatsappNumber(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function setWhatsappLinkState(element, phone, message) {
  if (!element) {
    return;
  }

  const sanitizedPhone = sanitizeWhatsappNumber(phone);
  const isEnabled = Boolean(sanitizedPhone);
  element.href = isEnabled ? buildWhatsappUrl(sanitizedPhone, message) : "#";
  element.classList.toggle("is-disabled", !isEnabled);
  element.setAttribute("aria-disabled", isEnabled ? "false" : "true");
  element.tabIndex = isEnabled ? 0 : -1;
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
  }).format(Number(amount || 0));
}

function formatWeekdayList(days) {
  return (Array.isArray(days) ? days : [])
    .map((day) => WEEKDAY_LABELS[Number(day)] || "")
    .filter(Boolean)
    .join(", ");
}

function buildProfessionalAddress(professional) {
  return [professional.address, professional.neighborhood, professional.city].filter(Boolean).join(" - ");
}

function parseBlockedDates(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d{4}-\d{2}-\d{2}$/.test(line));
}

function normalizeSettings(settings) {
  const professionals = sanitizeProfessionalsArray(settings?.professionals);
  return {
    businessWhatsapp: String(settings?.businessWhatsapp || DEFAULT_SETTINGS.businessWhatsapp),
    mercadoPagoCheckout: String(settings?.mercadoPagoCheckout || ""),
    pixKey: String(settings?.pixKey || ""),
    businessAddress: String(settings?.businessAddress || ""),
    blockedDates: sanitizeBlockedDatesArray(settings?.blockedDates),
    professionals,
  };
}

function sanitizeProfessionalsArray(value) {
  const professionals = Array.isArray(value) ? value : [];
  const normalized = professionals
    .map((professional) => ({
      id: String(professional?.id || "").trim(),
      name: String(professional?.name || "").trim(),
      role: String(professional?.role || "Profissional").trim(),
      whatsapp: sanitizeWhatsappNumber(professional?.whatsapp),
      address: String(professional?.address || "").trim(),
      neighborhood: String(professional?.neighborhood || "").trim(),
      city: String(professional?.city || "").trim(),
      bio: String(professional?.bio || "").trim(),
      photo: String(professional?.photo || "").trim(),
      galleryPhotos: Array.isArray(professional?.galleryPhotos)
        ? professional.galleryPhotos.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
        : [],
      galleryVideos: Array.isArray(professional?.galleryVideos)
        ? professional.galleryVideos.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 2)
        : [],
      specialties: Array.isArray(professional?.specialties)
        ? professional.specialties.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
      serviceDetails: String(professional?.serviceDetails || "").trim(),
      boundaries: Array.isArray(professional?.boundaries)
        ? professional.boundaries.map((item) => String(item || "").trim()).filter(Boolean)
        : DEFAULT_BOUNDARY_OPTIONS,
      services: Array.isArray(professional?.services)
        ? professional.services
            .map((service) => ({
              name: String(service?.name || "").trim(),
              duration: String(service?.duration || "").trim(),
              price: Number(service?.price || 0),
            }))
            .filter((service) => service.name && service.duration)
        : [],
      timeSlots: Array.isArray(professional?.timeSlots)
        ? professional.timeSlots.map((slot) => String(slot || "").trim()).filter(Boolean)
        : [],
      paymentMethods: Array.isArray(professional?.paymentMethods)
        ? professional.paymentMethods.map((method) => String(method || "").trim()).filter(Boolean)
        : [],
      allowedWeekdays: Array.isArray(professional?.allowedWeekdays)
        ? professional.allowedWeekdays.map((day) => Number(day)).filter((day) => day >= 0 && day <= 6)
        : [],
    }))
    .filter(
      (professional) =>
        professional.id &&
        professional.name &&
        professional.whatsapp &&
        professional.services.length &&
        professional.timeSlots.length &&
        professional.paymentMethods.length &&
        professional.allowedWeekdays.length
    );

  return normalized;
}

function sanitizeBlockedDatesArray(blockedDates) {
  const value = Array.isArray(blockedDates) ? blockedDates : [];
  return [...new Set(value.map((date) => String(date || "").trim()))].filter((date) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date)
  );
}

function parseCommaSeparatedList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLineSeparatedList(value) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseServicesTextarea(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [nameRaw, durationRaw, priceRaw] = line.split("|");
      const name = String(nameRaw || "").trim();
      const duration = String(durationRaw || "").trim();
      const price = Number(String(priceRaw || "").trim().replace(",", "."));
      if (!name || !duration || !Number.isFinite(price)) {
        return null;
      }
      return { name, duration, price };
    })
    .filter(Boolean);
}

function serializeServices(services) {
  return (Array.isArray(services) ? services : [])
    .map((service) => `${service.name}|${service.duration}|${service.price}`)
    .join("\n");
}

function createEmptyProfessional(index) {
  return {
    id: `profissional-${index}`,
    name: "",
    role: "",
    whatsapp: state.settings.businessWhatsapp || "",
    address: "",
    neighborhood: "",
    city: "",
    bio: "",
    photo: "",
    galleryPhotos: [],
    galleryVideos: [],
    specialties: [],
    serviceDetails: "",
    boundaries: [...DEFAULT_BOUNDARY_OPTIONS],
    services: [],
    timeSlots: [],
    paymentMethods: ["Pix"],
    allowedWeekdays: [1, 2, 3, 4, 5],
  };
}

function sanitizeSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function updateBookingSummary() {
  const professional = getSelectedProfessional();
  const selectedService = getSelectedService();
  const selectedDate = dateField.value;
  const selectedTime = getRadioValue("appointmentTime");
  const selectedPayment = getRadioValue("paymentMethod");
  const selectedRegion = serviceRegionField.value.trim();

  summaryProfessional.textContent = professional?.name || "Nenhuma profissional cadastrada";
  summaryService.textContent = selectedService?.name || "-";
  summaryDuration.textContent = selectedService?.duration || "-";
  summaryPrice.textContent = selectedService ? formatCurrency(selectedService.price) : "-";
  summaryPayment.textContent = selectedPayment || "-";
  summaryRegion.textContent = selectedRegion || (professional ? buildProfessionalAddress(professional) : "-") || "-";

  if (selectedDate && selectedTime) {
    summaryDateTime.textContent = `${formatDate(selectedDate)} as ${selectedTime}`;
  } else if (selectedDate) {
    summaryDateTime.textContent = formatDate(selectedDate);
  } else {
    summaryDateTime.textContent = "-";
  }
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

function getStatusLabel(status) {
  if (status === "pending_payment") {
    return "aguardando comprovante";
  }
  if (status === "cancelled") {
    return "cancelado";
  }
  return "confirmado";
}

function getPaymentStatusClassName(status) {
  return status === "paid" ? "payment-paid" : "payment-pending";
}

function getPaymentStatusLabel(status) {
  return status === "paid" ? "pago" : "pendente";
}

function getProfessionalApplicationStatusClassName(status) {
  if (status === "approved") {
    return "status-approved";
  }
  if (status === "blocked") {
    return "status-blocked";
  }
  if (status === "in_contact") {
    return "status-in-contact";
  }
  return "status-pending";
}

function getProfessionalApplicationStatusLabel(status) {
  if (status === "approved") {
    return "aprovada";
  }
  if (status === "blocked") {
    return "bloqueada";
  }
  if (status === "in_contact") {
    return "em contato";
  }
  return "pendente";
}

function getAvailabilityArray() {
  return Array.isArray(state.availability) ? state.availability : [];
}

function getAppointmentsArray() {
  return Array.isArray(state.appointments) ? state.appointments : [];
}

function getProfessionalApplicationsArray() {
  return Array.isArray(state.professionalApplications) ? state.professionalApplications : [];
}

function fallbackProfessionalImage() {
  return "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80";
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return String(value).replace(/"/g, '\\"');
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function formatDateTime(value) {
  if (!value) {
    return "Nao informado";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatShortDate(value) {
  if (!value) {
    return "Nao informado";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return formatDate(String(value));
  }

  return formatDateTime(value);
}

function getProfessionalApplicationSubscriptionLabel(status) {
  if (status === "active") {
    return "mensalidade ativa";
  }
  if (status === "overdue") {
    return "em atraso";
  }
  if (status === "blocked") {
    return "bloqueada";
  }
  return "aguardando pagamento";
}

function renderVideoEmbed(url, professionalName) {
  const safeUrl = escapeHtml(url);
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/i);
  if (youtubeMatch) {
    return `<iframe src="https://www.youtube.com/embed/${escapeHtml(youtubeMatch[1])}" title="Video de ${escapeHtml(professionalName)}" loading="lazy" allowfullscreen></iframe>`;
  }

  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/i);
  if (vimeoMatch) {
    return `<iframe src="https://player.vimeo.com/video/${escapeHtml(vimeoMatch[1])}" title="Video de ${escapeHtml(professionalName)}" loading="lazy" allowfullscreen></iframe>`;
  }

  return `<video controls preload="metadata" src="${safeUrl}"></video>`;
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
    const detailParts = [data.message, data.hint, data.code].filter(Boolean);
    throw new Error(detailParts.join(" - ") || statusHint || "Falha na comunicacao com a API.");
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
    return `${FALLBACK_API_BASE}${endpoint}`;
  }

  return endpoint;
}
