/**
 * script_med.js — Dashboard Médecin MediHub
 * Gestion UI + communication avec le backend Django
 */

const DashboardMed = (() => {

    // ========== CONFIGURATION ==========
    const config = {
        apiBaseUrl: '/api',
        endpoints: {
            dashboard: '/dashboard/medecin/',
            patients:  '/patients/',
            prescriptions: '/prescriptions/',
            appointments: '/rendezvous/',
            user:      '/user/',
            logout:    '/logout/',
        },
    };

    // ========== ÉTAT ==========
    let state = {
        currentSection: 'dashboard',
        patients: [],
        filteredPatients: [],
        prescriptions: [],
        filteredPrescriptions: [],
        appointments: [],
        filteredAppointments: [],
        currentUser: null,
        rdvDate: new Date(),
        rdvFilter: 'all',
        rdvView: 'list',
        deleteTarget: { type: null, id: null },
    };

    // ========== UTILITAIRES ==========

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('fr-FR');
    };

    const formatDateInput = (date) => {
        const d = new Date(date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const formatDateLabel = (date) => {
        return new Date(date).toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    };

    const showToast = (message, type = 'success') => {
        const toast = document.getElementById('toast');
        const icons = { success: '✓', error: '✕', info: 'ℹ' };
        toast.textContent = `${icons[type] || ''} ${message}`;
        toast.className = `toast ${type} show`;
        setTimeout(() => { toast.className = 'toast'; }, 3500);
    };

    const showError = (msg) => showToast(msg, 'error');
    const showSuccess = (msg) => showToast(msg, 'success');

    // ========== API REQUESTS ==========

    const fetchAPI = async (endpoint, options = {}) => {
        const url = `${config.apiBaseUrl}${endpoint}`;
        const defaults = {
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'include',
        };
        try {
            const resp = await fetch(url, { ...defaults, ...options });
            if (!resp.ok) throw new Error(`Erreur ${resp.status}: ${resp.statusText}`);
            return await resp.json();
        } catch (err) {
            showError(err.message);
            throw err;
        }
    };

    // ========== CHARGEMENT DONNÉES ==========

    const loadUserProfile = async () => {
        try {
            const data = await fetchAPI(config.endpoints.user);
            state.currentUser = data;
            const name = data.first_name || data.username || 'Médecin';
            ['username', 'sidebar-username'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = name;
            });
        } catch (e) { console.warn('Profil non chargé:', e.message); }
    };

    const loadDashboardData = async () => {
        try {
            const data = await fetchAPI(config.endpoints.dashboard);
            setText('stat-today-patients', data.patients_today ?? 0);
            setText('stat-waiting', data.patients_waiting ?? 0);
            setText('stat-completed', data.consultations_completed ?? 0);
            setText('stat-prescriptions', data.prescriptions_today ?? 0);
            setText('rdv-badge', data.rdv_waiting ?? 0);
        } catch (e) { console.warn('Dashboard non chargé'); }
    };

    const loadPatients = async () => {
        try {
            const data = await fetchAPI(config.endpoints.patients);
            state.patients = Array.isArray(data) ? data : (data.results || []);
            state.filteredPatients = [...state.patients];
            renderPatientTable();
            populatePatientDatalist();
            renderDashboardPatients();
        } catch (e) { console.warn('Patients non chargés'); }
    };

    const loadPrescriptions = async () => {
        try {
            const data = await fetchAPI(config.endpoints.prescriptions);
            state.prescriptions = Array.isArray(data) ? data : (data.results || []);
            state.filteredPrescriptions = [...state.prescriptions];
            renderPrescriptionTable();
        } catch (e) { console.warn('Prescriptions non chargées'); }
    };

    const loadAppointments = async (date) => {
        const dateStr = formatDateInput(date || state.rdvDate);
        try {
            const data = await fetchAPI(`${config.endpoints.appointments}?date=${dateStr}`);
            state.appointments = Array.isArray(data) ? data : (data.results || []);
            applyRdvFilter();
            renderDashboardRdv();
        } catch (e) { console.warn('RDV non chargés'); }
    };

    // ========== HELPERS DOM ==========

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    const emptyRow = (colspan, msg, icon = 'fa-inbox') =>
        `<tr><td colspan="${colspan}" class="empty-state">
            <i class="fas ${icon}"></i><p>${msg}</p></td></tr>`;

    // ========== RENDER PATIENTS ==========

    const renderPatientTable = () => {
        const tbody = document.getElementById('patientTableBody');
        if (!tbody) return;
        if (!state.filteredPatients.length) {
            tbody.innerHTML = emptyRow(6, 'Aucun patient enregistré');
            return;
        }
        tbody.innerHTML = state.filteredPatients.map(p => `<tr>
            <td><strong>${p.nom || ''} ${p.prenom || ''}</strong></td>
            <td>${formatDate(p.date_naissance)}</td>
            <td>${p.sexe === 'M' ? 'Masculin' : p.sexe === 'F' ? 'Féminin' : '-'}</td>
            <td>${p.telephone || '-'}</td>
            <td><span class="status ${p.groupe_sanguin ? 'purple' : ''}">${p.groupe_sanguin || '-'}</span></td>
            <td>${p.allergie ? `<span title="${p.allergie}">⚠ ${p.allergie.substring(0, 20)}${p.allergie.length > 20 ? '…' : ''}</span>` : '-'}</td>
        </tr>`).join('');
    };

    const renderDashboardPatients = () => {
        const tbody = document.getElementById('dashboard-patients-body');
        if (!tbody) return;
        const recent = state.patients.slice(0, 6);
        if (!recent.length) {
            tbody.innerHTML = emptyRow(3, 'Aucun patient récent');
            return;
        }
        tbody.innerHTML = recent.map(p => `<tr>
            <td><strong>${p.nom || ''} ${p.prenom || ''}</strong></td>
            <td>${p.telephone || '-'}</td>
            <td><span class="status ${p.groupe_sanguin ? 'purple' : ''}">${p.groupe_sanguin || '-'}</span></td>
        </tr>`).join('');
    };

    // ========== RENDER PRESCRIPTIONS ==========

    const renderPrescriptionTable = () => {
        const tbody = document.getElementById('prescriptionTableBody');
        if (!tbody) return;
        if (!state.filteredPrescriptions.length) {
            tbody.innerHTML = emptyRow(4, 'Aucune prescription enregistrée', 'fa-file-medical');
            return;
        }
        tbody.innerHTML = state.filteredPrescriptions.map(pres => {
            const medic = pres.medications ? pres.medications.substring(0, 40) + (pres.medications.length > 40 ? '…' : '') : '-';
            return `<tr>
                <td>${formatDate(pres.date)}</td>
                <td><strong>${pres.patient_nom || pres.patient || '-'}</strong></td>
                <td title="${pres.medications}">${medic}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn-edit" onclick="DashboardMed.editPrescription(${pres.id})" title="Modifier">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-delete" onclick="DashboardMed.confirmDelete('prescription', ${pres.id}, 'cette prescription')" title="Supprimer">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    };

    // ========== RENDER RDV ==========

    const applyRdvFilter = () => {
        if (state.rdvFilter === 'all') {
            state.filteredAppointments = [...state.appointments];
        } else {
            state.filteredAppointments = state.appointments.filter(r => r.statut === state.rdvFilter);
        }
        renderRdvTable();
        renderRdvTimeline();
        setText('rdv-count-label', state.filteredAppointments.length);
    };

    const statusRdvMap = {
        'attente':  ['orange', 'En attente'],
        'confirme': ['green',  'Confirmé'],
        'termine':  ['blue',   'Terminé'],
        'annule':   ['red',    'Annulé'],
    };

    const renderRdvTable = () => {
        const tbody = document.getElementById('rdvTableBody');
        if (!tbody) return;
        if (!state.filteredAppointments.length) {
            tbody.innerHTML = emptyRow(5, 'Aucun rendez-vous pour cette date', 'fa-calendar-times');
            return;
        }
        tbody.innerHTML = state.filteredAppointments.map(r => {
            const [sc, sl] = statusRdvMap[r.statut] || ['orange', r.statut || '-'];
            return `<tr>
                <td><strong>${r.heure || '-'}</strong></td>
                <td>${r.patient_nom || r.patient || '-'}</td>
                <td>${r.motif || '-'}</td>
                <td><span class="status ${sc}">${sl}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="btn-edit" onclick="DashboardMed.editRdv(${r.id})" title="Modifier">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-delete" onclick="DashboardMed.confirmDelete('rdv', ${r.id}, 'ce rendez-vous')" title="Supprimer">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    };

    const renderRdvTimeline = () => {
        const container = document.getElementById('timeline-container');
        if (!container) return;
        if (!state.filteredAppointments.length) {
            container.innerHTML = `<div class="empty-state" style="padding:60px;">
                <i class="fas fa-stream"></i><p>Aucun rendez-vous pour cette date</p></div>`;
            return;
        }
        const sorted = [...state.filteredAppointments].sort((a, b) => (a.heure || '').localeCompare(b.heure || ''));
        container.innerHTML = sorted.map(r => {
            const [sc, sl] = statusRdvMap[r.statut] || ['orange', r.statut || '-'];
            return `<div class="timeline-item">
                <div class="timeline-time">${r.heure || '--:--'}</div>
                <div class="timeline-dot"></div>
                <div class="timeline-body">
                    <div class="timeline-patient">${r.patient_nom || r.patient || '-'}
                        <span class="status ${sc}" style="margin-left:8px; font-size:0.7rem;">${sl}</span>
                    </div>
                    ${r.motif ? `<div class="timeline-motif">${r.motif}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    };

    const renderDashboardRdv = () => {
        const tbody = document.getElementById('dashboard-rdv-body');
        if (!tbody) return;
        const today = state.appointments.slice(0, 6);
        if (!today.length) {
            tbody.innerHTML = emptyRow(4, "Aucun rendez-vous aujourd'hui", 'fa-calendar-times');
            return;
        }
        tbody.innerHTML = today.map(r => {
            const [sc, sl] = statusRdvMap[r.statut] || ['orange', r.statut || '-'];
            return `<tr>
                <td><strong>${r.heure || '-'}</strong></td>
                <td>${r.patient_nom || '-'}</td>
                <td>${r.motif || '-'}</td>
                <td><span class="status ${sc}">${sl}</span></td>
            </tr>`;
        }).join('');
    };

    // ========== DATALIST ==========

    const populatePatientDatalist = () => {
        const options = state.patients.map(p =>
            `<option value="${p.nom} ${p.prenom}">`
        ).join('');
        
        const dl1 = document.getElementById('patients-datalist-pres');
        if (dl1) dl1.innerHTML = options;
        
        const dl2 = document.getElementById('patients-datalist-rdv');
        if (dl2) dl2.innerHTML = options;
    };

    // ========== NAVIGATION ==========

    const showSection = (sectionId) => {
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));

        const section = document.getElementById(`${sectionId}-section`);
        if (section) section.classList.add('active');

        const link = Array.from(document.querySelectorAll('.nav-item'))
            .find(l => l.getAttribute('data-section') === sectionId);
        if (link) link.classList.add('active');

        state.currentSection = sectionId;

        if (sectionId === 'dashboard')      { loadDashboardData(); loadAppointments(); }
        if (sectionId === 'patients')       loadPatients();
        if (sectionId === 'prescriptions')  loadPrescriptions();
        if (sectionId === 'appointments')   { loadPatients(); loadAppointments(); }
    };

    // ========== FORM HELPERS ==========

    const showForm = (formId) => {
        const el = document.getElementById(formId);
        if (el) { el.style.display = 'block'; el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    };

    const hideForm = (formId) => {
        const el = document.getElementById(formId);
        if (el) el.style.display = 'none';
    };

    const resetPrescriptionForm = () => {
        document.getElementById('prescription-id').value = '';
        document.getElementById('formPrescription').reset();
        document.getElementById('prescription-form-title').innerHTML = '<i class="fas fa-file-medical"></i> Nouvelle prescription';
        const dateInput = document.getElementById('pres-date');
        if (dateInput) dateInput.value = formatDateInput(new Date());
    };

    const resetRdvForm = () => {
        document.getElementById('rdv-id').value = '';
        document.getElementById('formRdv').reset();
        document.getElementById('rdv-form-title').innerHTML = '<i class="fas fa-calendar-plus"></i> Nouveau rendez-vous';
        const dateInput = document.getElementById('rdv-date');
        if (dateInput) dateInput.value = formatDateInput(state.rdvDate);
    };

    // ========== CRUD PRESCRIPTIONS ==========

    const editPrescription = (id) => {
        const pres = state.prescriptions.find(p => p.id === id);
        if (!pres) return;
        document.getElementById('prescription-id').value = id;
        document.getElementById('pres-patient').value = pres.patient_nom || pres.patient || '';
        document.getElementById('pres-date').value = pres.date || '';
        document.getElementById('pres-medications').value = pres.medications || '';
        document.getElementById('pres-notes').value = pres.notes || '';
        document.getElementById('prescription-form-title').innerHTML = '<i class="fas fa-pen"></i> Modifier la prescription';
        showForm('prescription-form-container');
    };

    const submitPrescriptionForm = async (e) => {
        e.preventDefault();
        const id = document.getElementById('prescription-id').value;
        const payload = {
            patient:     document.getElementById('pres-patient').value.trim(),
            date:        document.getElementById('pres-date').value,
            medications: document.getElementById('pres-medications').value.trim(),
            notes:       document.getElementById('pres-notes').value.trim(),
        };

        try {
            if (id) {
                await fetchAPI(`${config.endpoints.prescriptions}${id}/`, { method: 'PUT', body: JSON.stringify(payload) });
                showSuccess('Prescription mise à jour !');
            } else {
                await fetchAPI(config.endpoints.prescriptions, { method: 'POST', body: JSON.stringify(payload) });
                showSuccess('Prescription créée !');
            }
            hideForm('prescription-form-container');
            resetPrescriptionForm();
            loadPrescriptions();
            loadDashboardData();
        } catch (err) { /* error already shown */ }
    };

    // ========== CRUD RENDEZ-VOUS ==========

    const editRdv = (id) => {
        const r = state.appointments.find(x => x.id === id);
        if (!r) return;
        document.getElementById('rdv-id').value = id;
        document.getElementById('rdv-patient').value = r.patient_nom || r.patient || '';
        document.getElementById('rdv-date').value = r.date || formatDateInput(state.rdvDate);
        document.getElementById('rdv-heure').value = r.heure || '';
        document.getElementById('rdv-motif').value = r.motif || '';
        document.getElementById('rdv-statut').value = r.statut || 'attente';
        document.getElementById('rdv-form-title').innerHTML = '<i class="fas fa-pen"></i> Modifier le rendez-vous';
        showForm('rdv-form-container');
    };

    const submitRdvForm = async (e) => {
        e.preventDefault();
        const id = document.getElementById('rdv-id').value;
        const payload = {
            patient: document.getElementById('rdv-patient').value.trim(),
            date:    document.getElementById('rdv-date').value,
            heure:   document.getElementById('rdv-heure').value,
            motif:   document.getElementById('rdv-motif').value.trim(),
            statut:  document.getElementById('rdv-statut').value,
        };

        try {
            if (id) {
                await fetchAPI(`${config.endpoints.appointments}${id}/`, { method: 'PUT', body: JSON.stringify(payload) });
                showSuccess('Rendez-vous modifié !');
            } else {
                await fetchAPI(config.endpoints.appointments, { method: 'POST', body: JSON.stringify(payload) });
                showSuccess('Rendez-vous créé !');
            }
            hideForm('rdv-form-container');
            resetRdvForm();
            loadAppointments(state.rdvDate);
            loadDashboardData();
        } catch (err) { /* error already shown */ }
    };

    // ========== SUPPRESSION ==========

    const confirmDelete = (type, id, label) => {
        state.deleteTarget = { type, id };
        const textMap = {
            prescription: `Supprimer ${label} ? Cette action est irréversible.`,
            rdv:          `Supprimer ${label} ?`,
        };
        document.getElementById('delete-modal-text').textContent = textMap[type] || 'Supprimer cet élément ?';
        document.getElementById('delete-modal').style.display = 'flex';
    };

    const executeDelete = async () => {
        const { type, id } = state.deleteTarget;
        const endpointMap = {
            prescription: config.endpoints.prescriptions,
            rdv:          config.endpoints.appointments,
        };
        const endpoint = endpointMap[type];
        if (!endpoint || !id) return;

        try {
            await fetchAPI(`${endpoint}${id}/`, { method: 'DELETE' });
            showSuccess('Supprimé avec succès !');
            closeDeleteModal();

            if (type === 'prescription') { loadPrescriptions(); loadDashboardData(); }
            if (type === 'rdv')          { loadAppointments(state.rdvDate); loadDashboardData(); }
        } catch (err) { /* error already shown */ }
    };

    const closeDeleteModal = () => {
        document.getElementById('delete-modal').style.display = 'none';
        state.deleteTarget = { type: null, id: null };
    };

    // ========== DÉCONNEXION ==========

    const logout = () => {
        if (!confirm('Voulez-vous vraiment vous déconnecter ?')) return;
        window.location.href = config.endpoints.logout;
    };

    // ========== DATE ACTUELLE ==========

    const setCurrentDate = () => {
        const el = document.getElementById('current-date');
        if (el) {
            el.textContent = new Date().toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long'
            });
        }
        const rdvLabel = document.getElementById('rdv-date-label');
        if (rdvLabel) rdvLabel.textContent = 'Rendez-vous — ' + formatDateLabel(state.rdvDate);
    };

    // ========== EVENT LISTENERS ==========

    const initEventListeners = () => {

        // Navigation sidebar
        document.querySelectorAll('.nav-item[data-section]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                showSection(link.getAttribute('data-section'));
            });
        });

        // Liens "Voir tous" dans le dashboard
        document.querySelectorAll('.btn-link[data-section]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                showSection(link.getAttribute('data-section'));
            });
        });

        // Déconnexion
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); logout(); });

        // Recherche globale
        const globalSearch = document.getElementById('globalSearch');
        if (globalSearch) {
            globalSearch.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                if (state.currentSection === 'patients') {
                    state.filteredPatients = state.patients.filter(p =>
                        `${p.nom} ${p.prenom}`.toLowerCase().includes(term));
                    renderPatientTable();
                } else if (state.currentSection === 'prescriptions') {
                    state.filteredPrescriptions = state.prescriptions.filter(pres =>
                        `${pres.patient_nom || pres.patient}`.toLowerCase().includes(term));
                    renderPrescriptionTable();
                }
            });
        }

        // === PRESCRIPTIONS ===
        const btnAddPrescription = document.getElementById('btn-add-prescription');
        if (btnAddPrescription) btnAddPrescription.addEventListener('click', () => {
            resetPrescriptionForm();
            showForm('prescription-form-container');
        });

        const btnClosePrescriptionForm = document.getElementById('btn-close-prescription-form');
        if (btnClosePrescriptionForm) btnClosePrescriptionForm.addEventListener('click', () => hideForm('prescription-form-container'));

        const btnCancelPrescription = document.getElementById('btn-cancel-prescription');
        if (btnCancelPrescription) btnCancelPrescription.addEventListener('click', () => { resetPrescriptionForm(); hideForm('prescription-form-container'); });

        const formPrescription = document.getElementById('formPrescription');
        if (formPrescription) formPrescription.addEventListener('submit', submitPrescriptionForm);

        const prescriptionSearch = document.getElementById('prescription-search');
        if (prescriptionSearch) {
            prescriptionSearch.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                state.filteredPrescriptions = state.prescriptions.filter(pres =>
                    `${pres.patient_nom || pres.patient}`.toLowerCase().includes(term));
                renderPrescriptionTable();
            });
        }

        // === RENDEZ-VOUS ===
        const filterDate = document.getElementById('rdv-filter-date');
        if (filterDate) {
            filterDate.value = formatDateInput(state.rdvDate);
            filterDate.addEventListener('change', (e) => {
                state.rdvDate = new Date(e.target.value);
                setCurrentDate();
                loadAppointments(state.rdvDate);
            });
        }

        const btnCloseRdvForm = document.getElementById('btn-close-rdv-form');
        if (btnCloseRdvForm) btnCloseRdvForm.addEventListener('click', () => hideForm('rdv-form-container'));

        const btnCancelRdv = document.getElementById('btn-cancel-rdv');
        if (btnCancelRdv) btnCancelRdv.addEventListener('click', () => { resetRdvForm(); hideForm('rdv-form-container'); });

        const formRdv = document.getElementById('formRdv');
        if (formRdv) formRdv.addEventListener('submit', submitRdvForm);

        const prevDay = document.getElementById('rdv-prev-day');
        if (prevDay) prevDay.addEventListener('click', () => {
            state.rdvDate.setDate(state.rdvDate.getDate() - 1);
            if (filterDate) filterDate.value = formatDateInput(state.rdvDate);
            setCurrentDate();
            loadAppointments(state.rdvDate);
        });

        const nextDay = document.getElementById('rdv-next-day');
        if (nextDay) nextDay.addEventListener('click', () => {
            state.rdvDate.setDate(state.rdvDate.getDate() + 1);
            if (filterDate) filterDate.value = formatDateInput(state.rdvDate);
            setCurrentDate();
            loadAppointments(state.rdvDate);
        });

        const todayBtn = document.getElementById('rdv-today');
        if (todayBtn) todayBtn.addEventListener('click', () => {
            state.rdvDate = new Date();
            if (filterDate) filterDate.value = formatDateInput(state.rdvDate);
            setCurrentDate();
            loadAppointments(state.rdvDate);
        });

        // Filtre chips RDV
        document.querySelectorAll('.chip[data-filter]').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.chip[data-filter]').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                state.rdvFilter = chip.getAttribute('data-filter');
                applyRdvFilter();
            });
        });

        // Vue toggle liste/timeline
        document.querySelectorAll('.toggle-btn[data-view]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.toggle-btn[data-view]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.rdvView = btn.getAttribute('data-view');
                document.getElementById('rdv-list-view').style.display = state.rdvView === 'list' ? 'block' : 'none';
                document.getElementById('rdv-timeline-view').style.display = state.rdvView === 'timeline' ? 'block' : 'none';
            });
        });

        // Modal suppression
        const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
        if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', executeDelete);

        const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
        if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteModal);

        // Fermer modal en cliquant à l'extérieur
        const modal = document.getElementById('delete-modal');
        if (modal) modal.addEventListener('click', (e) => {
            if (e.target === modal) closeDeleteModal();
        });
    };

    // ========== INIT ==========

    const init = async () => {
        console.log('Initialisation Dashboard Médecin...');
        setCurrentDate();
        await loadUserProfile();
        await loadDashboardData();
        await loadPatients();
        initEventListeners();
        showSection('dashboard');
    };

    // ========== API PUBLIQUE ==========
    return {
        init,
        showSection,
        editPrescription,
        editRdv,
        confirmDelete,
        getState: () => state,
    };

})();

document.addEventListener('DOMContentLoaded', DashboardMed.init);
