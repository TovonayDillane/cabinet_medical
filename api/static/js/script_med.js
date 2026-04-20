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
            consultations: '/consultations/',
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
        consultations: [],
        filteredConsultations: [],
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

    // ========== CSRF TOKEN HELPER ==========

    const getCsrfToken = () => {
        // Try to get from DOM first
        const tokenElement = document.querySelector('[name=csrfmiddlewaretoken]');
        if (tokenElement && tokenElement.value) {
            return tokenElement.value;
        }
        // Fallback: extract from cookies
        const name = 'csrftoken';
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    };

    // ========== API REQUESTS ==========

    const fetchAPI = async (endpoint, options = {}) => {
        const url = `${config.apiBaseUrl}${endpoint}`;
        const defaults = {
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken(),
            },
            credentials: 'include',
        };
        try {
            const resp = await fetch(url, { ...defaults, ...options });
            if (!resp.ok) {
                let errorDetails = `Erreur ${resp.status}: ${resp.statusText}`;
                try {
                    const errorData = await resp.json();
                    if (errorData.error) {
                        errorDetails = errorData.error;
                    }
                } catch (e) {
                    // Pas de JSON, utiliser le statusText
                }
                console.error(`❌ API ${options.method || 'GET'} ${url}:`, errorDetails);
                throw new Error(errorDetails);
            }
            return await resp.json();
        } catch (err) {
            console.error(`❌ Erreur API (${url}):`, err.message);
            showError(err.message);
            throw err;
        }
    };

    // ========== CHARGEMENT DONNÉES ==========

    const loadUserProfile = async () => {
        try {
            console.log('👤 Chargement du profil utilisateur...');
            const data = await fetchAPI(config.endpoints.user);
            state.currentUser = data;
            const name = data.first_name || data.username || 'Médecin';
            console.log('✓ Profil chargé:', name);
            ['username', 'sidebar-username'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = name;
            });
        } catch (e) { 
            console.error('❌ Profil non chargé:', e.message);
            showError('Impossible de charger le profil utilisateur');
        }
    };

    const loadDashboardData = async () => {
        try {
            console.log('📊 Chargement des données dashboard...');
            const data = await fetchAPI(config.endpoints.dashboard);
            setText('stat-today-patients', data.patients_today ?? 0);
            setText('stat-waiting', data.patients_waiting ?? 0);
            setText('stat-completed', data.consultations_completed ?? 0);
            setText('stat-prescriptions', data.prescriptions_today ?? 0);
            setText('rdv-badge', data.rdv_waiting ?? 0);
            console.log('✓ Dashboard data chargées');
        } catch (e) { 
            console.error('❌ Dashboard non chargé:', e.message);
        }
    };

    const loadPatients = async () => {
        try {
            console.log('👥 Chargement des patients...');
            const data = await fetchAPI(config.endpoints.patients);
            state.patients = Array.isArray(data) ? data : (data.results || []);
            state.filteredPatients = [...state.patients];
            console.log(state.patients.length, 'patients chargés');
            renderPatientTable();
            populatePatientDatalist();
            renderDashboardPatients();
        } catch (e) { console.warn('Patients non chargés'); }
    };

    const loadConsultations = async () => {
        try {
            console.log('📋 Chargement des consultations...');
            const data = await fetchAPI(config.endpoints.consultations);
            state.consultations = Array.isArray(data) ? data : (data.results || []);
            state.filteredConsultations = [...state.consultations];
            console.log(state.consultations.length, 'consultations chargées');
            renderConsultationTable();
            populateConsultationSelect();
        } catch (e) { console.warn('Consultations non chargées:', e.message); }
    };

    const loadPrescriptions = async () => {
        try {
            console.log('📋 Chargement des prescriptions...');
            const data = await fetchAPI(config.endpoints.prescriptions);
            state.prescriptions = Array.isArray(data) ? data : (data.results || []);
            state.filteredPrescriptions = [...state.prescriptions];
            console.log(state.prescriptions.length, 'prescriptions chargées');
            populateConsultationSelect();  // Remplir le select des consultations
            renderPrescriptionTable();
        } catch (e) { 
            console.error('❌ Prescriptions non chargées:', e.message);
        }
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

    const renderConsultationTable = () => {
        const tbody = document.getElementById('consultationTableBody');
        if (!tbody) return;
        if (!state.filteredConsultations.length) {
            tbody.innerHTML = emptyRow(5, 'Aucune consultation enregistrée', 'fa-stethoscope');
            return;
        }
        tbody.innerHTML = state.filteredConsultations.map(cons => {
            const symptoms = cons.symptome ? cons.symptome.substring(0, 30) + (cons.symptome.length > 30 ? '…' : '') : '-';
            const diagnostic = cons.diagnostic ? cons.diagnostic.substring(0, 30) + (cons.diagnostic.length > 30 ? '…' : '') : '-';
            return `<tr>
                <td>${formatDate(cons.date)}</td>
                <td><strong>${cons.patient_nom || cons.patient || '-'}</strong></td>
                <td title="${cons.symptome}">${symptoms}</td>
                <td title="${cons.diagnostic}">${diagnostic}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn-edit" onclick="DashboardMed.editConsultation(${cons.id})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-delete" onclick="DashboardMed.confirmDelete('consultation', ${cons.id}, 'cette consultation')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
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
            const medic = pres.medications ? pres.medications.substring(0, 10) + (pres.medications.length > 10 ? '…' : '') : '-';
            return `<tr>
                <td>${formatDate(pres.date)}</td>
                <td><strong>${pres.patient_nom || pres.patient || '-'}</strong></td>
                <td>
                    <button class="btn-text-link" onclick="DashboardMed.viewPrescriptionDetail(${pres.id})" title="Voir les détails" style="background: none; border: none; color: #333; cursor: pointer; text-decoration: underline; padding: 0; font-size: inherit; font-family: inherit;" onmouseover="this.style.color='#007bff'" onmouseout="this.style.color='#333'">
                        ${medic}
                    </button>
                </td>
                <td>
                    <div class="action-btns">
                        <button class="btn-edit" onclick="DashboardMed.editPrescription(${pres.id})" title="Modifier">
                            <i class="fas fa-pen"></i>M
                        </button>
                        <button class="btn-delete" onclick="DashboardMed.confirmDelete('prescription', ${pres.id}, 'cette prescription')" title="Supprimer">
                            <i class="fas fa-trash"></i>X
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
                        <button class="btn-edit" onclick="DashboardMed.editRdv(${r.id})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-delete" onclick="DashboardMed.confirmDelete('rdv', ${r.id}, 'ce rendez-vous')">
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
        
        const dl1 = document.getElementById('patients-datalist-cons');
        if (dl1) dl1.innerHTML = options;

        const dl2 = document.getElementById('patients-datalist-pres');
        if (dl2) dl2.innerHTML = options;
        
        const dl3 = document.getElementById('patients-datalist-rdv');
        if (dl3) dl3.innerHTML = options;
    };

    const populateConsultationSelect = () => {
        const select = document.getElementById('pres-consultation');
        if (!select) return;
        const options = state.consultations.map(cons => 
            `<option value="${cons.id}">${formatDate(cons.date)} - ${cons.patient_nom || cons.patient || '-'}</option>`
        ).join('');
        select.innerHTML = `<option value="">-- Sélectionner une consultation --</option>${options}`;
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
        if (sectionId === 'consultations')  { loadConsultations(); loadPrescriptions(); }
        if (sectionId === 'prescriptions')  { loadConsultations(); loadPrescriptions(); }
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
    };

    const resetConsultationForm = () => {
        document.getElementById('consultation-id').value = '';
        document.getElementById('formConsultation').reset();
        document.getElementById('consultation-form-title').innerHTML = '<i class="fas fa-stethoscope"></i> Nouvelle consultation';
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
        if (!pres) {
            console.warn('Prescription non trouvée');
            return;
        }
        document.getElementById('prescription-id').value = id;
        document.getElementById('pres-consultation').value = pres.consultation || '';
        document.getElementById('pres-medicaments').value = pres.medications || '';
        document.getElementById('prescription-form-title').innerHTML = '<i class="fas fa-pen"></i> Modifier la prescription';
        showForm('prescription-form-container');
    };

    const submitPrescriptionForm = async (e) => {
        e.preventDefault();
        console.log('📋 Soumission du formulaire prescription...');
        
        const consultationId = document.getElementById('pres-consultation').value;
        const medicaments = document.getElementById('pres-medicaments').value.trim();
        
        console.log('Consultation ID:', consultationId);
        console.log('Médicaments:', medicaments);
        
        // Validation
        if (!consultationId) {
            showError('Veuillez sélectionner une consultation');
            return;
        }
        if (!medicaments) {
            showError('Veuillez entrer les médicaments');
            return;
        }
        
        const id = document.getElementById('prescription-id').value;
        const payload = {
            consultation: consultationId,
            medications: medicaments,
        };

        try {
            let response;
            if (id) {
                response = await fetchAPI(`${config.endpoints.prescriptions}${id}/`, { 
                    method: 'PUT', 
                    body: JSON.stringify(payload) 
                });
                showSuccess('Prescription mise à jour !');
            } else {
                response = await fetchAPI(config.endpoints.prescriptions, { 
                    method: 'POST', 
                    body: JSON.stringify(payload) 
                });
                showSuccess('Prescription créée !');
            }
            hideForm('prescription-form-container');
            resetPrescriptionForm();
            loadPrescriptions();
            loadDashboardData();
        } catch (err) { 
            console.error('Erreur prescription:', err);
            showError(err.message || 'Erreur lors de l\'enregistrement de la prescription');
        }
    };

    // ========== CRUD CONSULTATIONS ==========

    const editConsultation = (id) => {
        const cons = state.consultations.find(c => c.id === id);
        if (!cons) return;
        document.getElementById('consultation-id').value = id;
        document.getElementById('cons-patient').value = cons.patient_nom || cons.patient || '';
        document.getElementById('cons-symptome').value = cons.symptome || '';
        document.getElementById('cons-diagnostic').value = cons.diagnostic || '';
        document.getElementById('consultation-form-title').innerHTML = '<i class="fas fa-pen"></i> Modifier la consultation';
        showForm('consultation-form-container');
    };

    const submitConsultationForm = async (e) => {
        e.preventDefault();
        const id = document.getElementById('consultation-id').value;
        const patientValue = document.getElementById('cons-patient').value.trim();
        const payload = {
            patient:    patientValue,
            symptome:   document.getElementById('cons-symptome').value.trim(),
            diagnostic: document.getElementById('cons-diagnostic').value.trim(),
        };

        try {
            if (id) {
                await fetchAPI(`${config.endpoints.consultations}${id}/`, { method: 'PUT', body: JSON.stringify(payload) });
                showSuccess('Consultation mise à jour !');
            } else {
                await fetchAPI(config.endpoints.consultations, { method: 'POST', body: JSON.stringify(payload) });
                showSuccess('Consultation créée !');
            }
            hideForm('consultation-form-container');
            resetConsultationForm();
            loadConsultations();
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
        const rdvDate = document.getElementById('rdv-date').value;
        const payload = {
            patient: document.getElementById('rdv-patient').value.trim(),
            date:    rdvDate,
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
            // Mettre à jour la date et recharger
            state.rdvDate = new Date(rdvDate);
            const filterDate = document.getElementById('rdv-filter-date');
            if (filterDate) {
                filterDate.value = formatDateInput(state.rdvDate);
            }
            setCurrentDate();
            loadAppointments(state.rdvDate);
            loadDashboardData();
        } catch (err) { /* error already shown */ }
    };

    // ========== SUPPRESSION ==========

    const confirmDelete = (type, id, label) => {
        state.deleteTarget = { type, id };
        const textMap = {
            consultation: `Supprimer ${label} ? Cette action est irréversible.`,
            prescription: `Supprimer ${label} ? Cette action est irréversible.`,
            rdv:          `Supprimer ${label} ?`,
        };
        document.getElementById('delete-modal-text').textContent = textMap[type] || 'Supprimer cet élément ?';
        document.getElementById('delete-modal').style.display = 'flex';
    };

    const executeDelete = async () => {
        const { type, id } = state.deleteTarget;
        const endpointMap = {
            consultation: config.endpoints.consultations,
            prescription: config.endpoints.prescriptions,
            rdv:          config.endpoints.appointments,
        };
        const endpoint = endpointMap[type];
        if (!endpoint || !id) return;

        try {
            await fetchAPI(`${endpoint}${id}/`, { method: 'DELETE' });
            showSuccess('Supprimé avec succès !');
            closeDeleteModal();

            if (type === 'consultation') { loadConsultations(); loadDashboardData(); }
            if (type === 'prescription') { loadPrescriptions(); loadDashboardData(); }
            if (type === 'rdv')          { loadAppointments(state.rdvDate); loadDashboardData(); }
        } catch (err) { /* error already shown */ }
    };

    const closeDeleteModal = () => {
        document.getElementById('delete-modal').style.display = 'none';
        state.deleteTarget = { type: null, id: null };
    };

    // ========== DÉCONNEXION ==========

    const showLogoutModal = () => {
        document.getElementById('logout-modal').style.display = 'flex';
    };

    const closeLogoutModal = () => {
        document.getElementById('logout-modal').style.display = 'none';
    };

    const confirmLogout = () => {
        window.location.href = config.endpoints.logout;
    };

    const logout = () => {
        showLogoutModal();
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
        try {
            console.log('🔌 Attachement des event listeners...');

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
                } else if (state.currentSection === 'consultations') {
                    state.filteredConsultations = state.consultations.filter(cons =>
                        `${cons.patient_nom || cons.patient}`.toLowerCase().includes(term));
                    renderConsultationTable();
                } else if (state.currentSection === 'prescriptions') {
                    state.filteredPrescriptions = state.prescriptions.filter(pres =>
                        `${pres.patient_nom || pres.patient}`.toLowerCase().includes(term));
                    renderPrescriptionTable();
                }
            });
        }

        // === CONSULTATIONS ===
        const btnAddConsultation = document.getElementById('btn-add-consultation');
        if (btnAddConsultation) btnAddConsultation.addEventListener('click', () => {
            resetConsultationForm();
            showForm('consultation-form-container');
        });

        const btnCloseConsultationForm = document.getElementById('btn-close-consultation-form');
        if (btnCloseConsultationForm) btnCloseConsultationForm.addEventListener('click', () => hideForm('consultation-form-container'));

        const btnCancelConsultation = document.getElementById('btn-cancel-consultation');
        if (btnCancelConsultation) btnCancelConsultation.addEventListener('click', () => { resetConsultationForm(); hideForm('consultation-form-container'); });

        const formConsultation = document.getElementById('formConsultation');
        if (formConsultation) formConsultation.addEventListener('submit', submitConsultationForm);

        const consultationSearch = document.getElementById('consultation-search');
        if (consultationSearch) {
            consultationSearch.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                state.filteredConsultations = state.consultations.filter(cons =>
                    `${cons.patient_nom || cons.patient}`.toLowerCase().includes(term));
                renderConsultationTable();
            });
        }

        // === PRESCRIPTIONS ===
        const btnAddPrescription = document.getElementById('btn-add-prescription');
        if (btnAddPrescription) {
            console.log('✓ Bouton "Nouvelle prescription" trouvé');
            btnAddPrescription.addEventListener('click', () => {
                resetPrescriptionForm();
                showForm('prescription-form-container');
            });
        } else {
            console.warn('✗ Bouton "Nouvelle prescription" NOT FOUND');
        }

        const btnClosePrescriptionForm = document.getElementById('btn-close-prescription-form');
        if (btnClosePrescriptionForm) btnClosePrescriptionForm.addEventListener('click', () => hideForm('prescription-form-container'));

        const btnCancelPrescription = document.getElementById('btn-cancel-prescription');
        if (btnCancelPrescription) btnCancelPrescription.addEventListener('click', () => { resetPrescriptionForm(); hideForm('prescription-form-container'); });

        const formPrescription = document.getElementById('formPrescription');
        if (formPrescription) {
            console.log('✓ Formulaire prescription trouvé, attachement du listener submit');
            formPrescription.addEventListener('submit', submitPrescriptionForm);
        } else {
            console.warn('✗ Formulaire prescription NOT FOUND - IDs ne correspondent pas!');
        }

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

        // Modal déconnexion
        const confirmLogoutBtn = document.getElementById('confirm-logout-btn');
        if (confirmLogoutBtn) confirmLogoutBtn.addEventListener('click', confirmLogout);

        const cancelLogoutBtn = document.getElementById('cancel-logout-btn');
        if (cancelLogoutBtn) cancelLogoutBtn.addEventListener('click', closeLogoutModal);

        // Fermer modal en cliquant à l'extérieur
        const logoutModal = document.getElementById('logout-modal');
        if (logoutModal) logoutModal.addEventListener('click', (e) => {
            if (e.target === logoutModal) closeLogoutModal();
        });

        // Fermer prescription detail modal en cliquant à l'extérieur
        const prescriptionDetailModal = document.getElementById('prescription-detail-modal');
        if (prescriptionDetailModal) {
            prescriptionDetailModal.addEventListener('click', (e) => {
                if (e.target === prescriptionDetailModal) closePrescriptionDetailModal();
            });
        }
        } catch (err) {
            console.error('❌ Erreur lors de l\'attachement des event listeners:', err);
            console.error(err.stack);
        }
    };

    // ========== INIT ==========

    const init = async () => {
        console.log('🚀 Initialisation Dashboard Médecin...');
        setCurrentDate();
        await loadUserProfile();
        await loadDashboardData();
        await loadPatients();
        await loadConsultations();  // Charger les consultations au démarrage
        await loadPrescriptions();  // Charger les prescriptions au démarrage
        console.log('✓ Toutes les données chargées');
        initEventListeners();
        console.log('✓ Event listeners attachés');
        showSection('dashboard');
    };

    // ========== PRESCRIPTION DETAIL MODAL ==========

    let currentPrescription = null;

    const viewPrescriptionDetail = (id) => {
        const pres = state.prescriptions.find(p => p.id === id);
        if (!pres) return;
        
        currentPrescription = pres;
        
        // Remplir la modale
        document.getElementById('detail-patient-nom').textContent = pres.patient_nom || '-';
        document.getElementById('detail-medecin-nom').textContent = pres.medecin_nom || '-';
        document.getElementById('detail-consultation-date').textContent = formatDate(pres.date) || '-';
        document.getElementById('detail-symptome').textContent = pres.symptome || '-';
        document.getElementById('detail-diagnostic').textContent = pres.diagnostic || '-';
        document.getElementById('detail-medications').textContent = pres.medications || '-';
        
        // Afficher la modale
        document.getElementById('prescription-detail-modal').style.display = 'flex';
    };

    const closePrescriptionDetailModal = () => {
        document.getElementById('prescription-detail-modal').style.display = 'none';
        currentPrescription = null;
    };

    const printPrescription = () => {
        if (!currentPrescription) return;
        
        const pres = currentPrescription;
        
        // Créer une fenêtre d'impression
        const printWindow = window.open('', '', 'height=600,width=800');
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Prescription - ${pres.patient_nom}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 20px;
                        color: #333;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 30px;
                        border-bottom: 2px solid #007bff;
                        padding-bottom: 20px;
                    }
                    .header h1 {
                        margin: 0;
                        color: #007bff;
                    }
                    .header p {
                        margin: 5px 0;
                        color: #666;
                    }
                    .prescription-content {
                        margin-bottom: 30px;
                    }
                    .section {
                        margin-bottom: 20px;
                    }
                    .section-title {
                        font-weight: bold;
                        background-color: #f0f8ff;
                        padding: 10px;
                        border-left: 4px solid #007bff;
                        margin-bottom: 10px;
                    }
                    .section-content {
                        padding-left: 20px;
                        white-space: pre-wrap;
                        line-height: 1.6;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 40px;
                        padding-top: 20px;
                        border-top: 1px solid #ddd;
                        color: #999;
                        font-size: 12px;
                    }
                    .info-row {
                        display: flex;
                        margin-bottom: 10px;
                        align-items: flex-start;
                    }
                    .info-label {
                        font-weight: bold;
                        width: 150px;
                        min-width: 150px;
                    }
                    .info-value {
                        flex: 1;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>PRESCRIPTION MÉDICALE</h1>
                    <p>Cabinet Médical</p>
                </div>
                
                <div class="prescription-content">
                    <div class="section">
                        <div class="section-title">Informations</div>
                        <div class="section-content">
                            <div class="info-row">
                                <div class="info-label">Patient:</div>
                                <div class="info-value">${pres.patient_nom || '-'}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Médecin:</div>
                                <div class="info-value">${pres.medecin_nom || '-'}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Date:</div>
                                <div class="info-value">${formatDate(pres.date) || '-'}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="section">
                        <div class="section-title">Symptômes</div>
                        <div class="section-content">${pres.symptome || '-'}</div>
                    </div>
                    
                    <div class="section">
                        <div class="section-title">Diagnostic</div>
                        <div class="section-content">${pres.diagnostic || '-'}</div>
                    </div>
                    
                    <div class="section">
                        <div class="section-title">Prescription Médicale</div>
                        <div class="section-content">${pres.medications || '-'}</div>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Cette prescription a été générée le ${new Date().toLocaleDateString('fr-FR')}</p>
                </div>
            </body>
            </html>
        `;
        
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        
        // Imprimer après un délai pour que le contenu soit bien chargé
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    };

    // ========== API PUBLIQUE ==========
    return {
        init,
        showSection,
        editConsultation,
        editPrescription,
        editRdv,
        confirmDelete,
        viewPrescriptionDetail,
        closePrescriptionDetailModal,
        printPrescription,
        getState: () => state,
    };

})();

document.addEventListener('DOMContentLoaded', DashboardMed.init);
