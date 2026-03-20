/**
 * script_secr.js — Dashboard Secrétaire MediHub
 * Gestion UI + communication avec le backend Django
 */

const DashboardSecr = (() => {

    // ========== CONFIGURATION ==========
    const config = {
        apiBaseUrl: '/api',
        endpoints: {
            dashboard: '/dashboard/secretaire/',
            doctors:   '/medecins/',
            patients:  '/patients/',
            appointments: '/rendezvous/',
            user:      '/user/',
            logout:    '/logout/',
        },
    };

    // ========== ÉTAT ==========
    let state = {
        currentSection: 'dashboard',
        doctors: [],
        filteredDoctors: [],
        patients: [],
        filteredPatients: [],
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
            const name = data.first_name || data.username || 'Secrétaire';
            ['username', 'sidebar-username'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = name;
            });
        } catch (e) { console.warn('Profil non chargé:', e.message); }
    };

    const loadDashboardData = async () => {
        try {
            const data = await fetchAPI(config.endpoints.dashboard);
            setText('stat-rdv-today', data.rdv_today ?? 0);
            setText('stat-rdv-waiting', data.rdv_waiting ?? 0);
            setText('stat-doctors', data.total_doctors ?? 0);
            setText('stat-patients', data.total_patients ?? 0);
            setText('rdv-badge', data.rdv_waiting ?? 0);
        } catch (e) { console.warn('Dashboard non chargé'); }
    };

    const loadDoctors = async () => {
        try {
            const data = await fetchAPI(config.endpoints.doctors);
            state.doctors = Array.isArray(data) ? data : (data.results || []);
            state.filteredDoctors = [...state.doctors];
            renderDoctorTable();
            populateDoctorSelect();
        } catch (e) { console.warn('Médecins non chargés'); }
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

    // ========== RENDER MÉDECINS ==========

    const renderDoctorTable = () => {
        const tbody = document.getElementById('doctorTableBody');
        if (!tbody) return;
        if (!state.filteredDoctors.length) {
            tbody.innerHTML = emptyRow(6, 'Aucun médecin enregistré', 'fa-user-md');
            return;
        }
        tbody.innerHTML = state.filteredDoctors.map(doc => {
            const statusMap = {
                'disponible':   ['green',  'Disponible'],
                'indisponible': ['orange', 'Indisponible'],
                'conge':        ['blue',   'En congé'],
            };
            const [sc, sl] = statusMap[doc.disponibilite] || ['orange', doc.disponibilite || '-'];
            return `<tr>
                <td><strong>Dr. ${doc.nom || ''} ${doc.prenom || ''}</strong></td>
                <td>${doc.specialite || '-'}</td>
                <td>${doc.telephone || '-'}</td>
                <td>${doc.email || '-'}</td>
                <td><span class="status ${sc}">${sl}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="btn-edit" onclick="DashboardSecr.editDoctor(${doc.id})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-delete" onclick="DashboardSecr.confirmDelete('doctor', ${doc.id}, 'Dr. ${doc.nom} ${doc.prenom}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    };

    // ========== RENDER PATIENTS ==========

    const renderPatientTable = () => {
        const tbody = document.getElementById('patientTableBody');
        if (!tbody) return;
        if (!state.filteredPatients.length) {
            tbody.innerHTML = emptyRow(7, 'Aucun patient enregistré');
            return;
        }
        tbody.innerHTML = state.filteredPatients.map(p => `<tr>
            <td><strong>${p.nom || ''} ${p.prenom || ''}</strong></td>
            <td>${formatDate(p.date_naissance)}</td>
            <td>${p.sexe === 'M' ? 'Masculin' : p.sexe === 'F' ? 'Féminin' : '-'}</td>
            <td>${p.telephone || '-'}</td>
            <td><span class="status ${p.groupe_sanguin ? 'purple' : ''}">${p.groupe_sanguin || '-'}</span></td>
            <td>${p.allergie ? `<span title="${p.allergie}">⚠ ${p.allergie.substring(0, 20)}${p.allergie.length > 20 ? '…' : ''}</span>` : '-'}</td>
            <td>
                <div class="action-btns">
                    <button class="btn-edit" onclick="DashboardSecr.editPatient(${p.id})">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn-delete" onclick="DashboardSecr.confirmDelete('patient', ${p.id}, '${p.nom} ${p.prenom}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
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
            tbody.innerHTML = emptyRow(6, 'Aucun rendez-vous pour cette date', 'fa-calendar-times');
            return;
        }
        tbody.innerHTML = state.filteredAppointments.map(r => {
            const [sc, sl] = statusRdvMap[r.statut] || ['orange', r.statut || '-'];
            const docName = r.medecin_nom || (state.doctors.find(d => d.id === r.medecin)?.nom + ' ' + (state.doctors.find(d => d.id === r.medecin)?.prenom || '')) || '-';
            return `<tr>
                <td><strong>${r.heure || '-'}</strong></td>
                <td>${r.patient_nom || r.patient || '-'}</td>
                <td>Dr. ${docName}</td>
                <td>${r.motif || '-'}</td>
                <td><span class="status ${sc}">${sl}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="btn-edit" onclick="DashboardSecr.editRdv(${r.id})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-delete" onclick="DashboardSecr.confirmDelete('rdv', ${r.id}, 'ce rendez-vous')">
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
            const docName = r.medecin_nom || '-';
            return `<div class="timeline-item">
                <div class="timeline-time">${r.heure || '--:--'}</div>
                <div class="timeline-dot"></div>
                <div class="timeline-body">
                    <div class="timeline-patient">${r.patient_nom || r.patient || '-'}
                        <span class="status ${sc}" style="margin-left:8px; font-size:0.7rem;">${sl}</span>
                    </div>
                    <div class="timeline-doctor"><i class="fas fa-user-md" style="font-size:11px;"></i> Dr. ${docName}</div>
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
                <td>${r.medecin_nom ? 'Dr. ' + r.medecin_nom : '-'}</td>
                <td><span class="status ${sc}">${sl}</span></td>
            </tr>`;
        }).join('');
    };

    // ========== DATALIST & SELECT ==========

    const populatePatientDatalist = () => {
        const dl = document.getElementById('patients-datalist');
        if (!dl) return;
        dl.innerHTML = state.patients.map(p =>
            `<option value="${p.nom} ${p.prenom}">`
        ).join('');
    };

    const populateDoctorSelect = () => {
        const sel = document.getElementById('rdv-medecin');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Sélectionner un médecin --</option>' +
            state.doctors.map(d =>
                `<option value="${d.id}">Dr. ${d.nom} ${d.prenom} — ${d.specialite || ''}</option>`
            ).join('');
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

        if (sectionId === 'dashboard')    { loadDashboardData(); loadAppointments(); }
        if (sectionId === 'doctors')      loadDoctors();
        if (sectionId === 'patients')     loadPatients();
        if (sectionId === 'appointments') { loadDoctors(); loadPatients(); loadAppointments(); }
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

    const resetDoctorForm = () => {
        document.getElementById('doctor-id').value = '';
        document.getElementById('formDoctor').reset();
        document.getElementById('doctor-form-title').innerHTML = '<i class="fas fa-user-md"></i> Nouveau médecin';
    };

    const resetPatientForm = () => {
        document.getElementById('patient-id').value = '';
        document.getElementById('formPatient').reset();
        document.getElementById('patient-form-title').innerHTML = '<i class="fas fa-procedures"></i> Nouveau patient';
    };

    const resetRdvForm = () => {
        document.getElementById('rdv-id').value = '';
        document.getElementById('formRdv').reset();
        document.getElementById('rdv-form-title').innerHTML = '<i class="fas fa-calendar-plus"></i> Nouveau rendez-vous';
        // Pré-remplir la date avec la date sélectionnée
        const dateInput = document.getElementById('rdv-date');
        if (dateInput) dateInput.value = formatDateInput(state.rdvDate);
    };

    // ========== CRUD MÉDECINS ==========

    const editDoctor = (id) => {
        const doc = state.doctors.find(d => d.id === id);
        if (!doc) return;
        document.getElementById('doctor-id').value = id;
        document.getElementById('doc-nom').value = doc.nom || '';
        document.getElementById('doc-prenom').value = doc.prenom || '';
        document.getElementById('doc-specialite').value = doc.specialite || '';
        document.getElementById('doc-telephone').value = doc.telephone || '';
        document.getElementById('doc-email').value = doc.email || '';
        document.getElementById('doc-disponibilite').value = doc.disponibilite || 'disponible';
        document.getElementById('doctor-form-title').innerHTML = `<i class="fas fa-pen"></i> Modifier Dr. ${doc.nom} ${doc.prenom}`;
        showForm('doctor-form-container');
    };

    const submitDoctorForm = async (e) => {
        e.preventDefault();
        const id = document.getElementById('doctor-id').value;
        const payload = {
            nom:           document.getElementById('doc-nom').value.trim(),
            prenom:        document.getElementById('doc-prenom').value.trim(),
            specialite:    document.getElementById('doc-specialite').value.trim(),
            telephone:     document.getElementById('doc-telephone').value.trim(),
            email:         document.getElementById('doc-email').value.trim(),
            disponibilite: document.getElementById('doc-disponibilite').value,
        };

        try {
            if (id) {
                await fetchAPI(`${config.endpoints.doctors}${id}/`, { method: 'PUT', body: JSON.stringify(payload) });
                showSuccess('Médecin mis à jour !');
            } else {
                await fetchAPI(config.endpoints.doctors, { method: 'POST', body: JSON.stringify(payload) });
                showSuccess('Médecin ajouté !');
            }
            hideForm('doctor-form-container');
            resetDoctorForm();
            loadDoctors();
            loadDashboardData();
        } catch (err) { /* error already shown */ }
    };

    // ========== CRUD PATIENTS ==========

    const editPatient = (id) => {
        const p = state.patients.find(x => x.id === id);
        if (!p) return;
        document.getElementById('patient-id').value = id;
        document.getElementById('pat-nom').value = p.nom || '';
        document.getElementById('pat-prenom').value = p.prenom || '';
        document.getElementById('pat-dob').value = p.date_naissance || '';
        document.getElementById('pat-sexe').value = p.sexe || '';
        document.getElementById('pat-telephone').value = p.telephone || '';
        document.getElementById('pat-groupe-sanguin').value = p.groupe_sanguin || '';
        document.getElementById('pat-adresse').value = p.adresse || '';
        document.getElementById('pat-allergie').value = p.allergie || '';
        document.getElementById('patient-form-title').innerHTML = `<i class="fas fa-pen"></i> Modifier ${p.nom} ${p.prenom}`;
        showForm('patient-form-container');
    };

    const submitPatientForm = async (e) => {
        e.preventDefault();
        const id = document.getElementById('patient-id').value;
        const payload = {
            nom:             document.getElementById('pat-nom').value.trim(),
            prenom:          document.getElementById('pat-prenom').value.trim(),
            date_naissance:  document.getElementById('pat-dob').value || null,
            sexe:            document.getElementById('pat-sexe').value,
            telephone:       document.getElementById('pat-telephone').value.trim(),
            groupe_sanguin:  document.getElementById('pat-groupe-sanguin').value,
            adresse:         document.getElementById('pat-adresse').value.trim(),
            allergie:        document.getElementById('pat-allergie').value.trim(),
        };

        try {
            if (id) {
                await fetchAPI(`${config.endpoints.patients}${id}/`, { method: 'PUT', body: JSON.stringify(payload) });
                showSuccess('Patient mis à jour !');
            } else {
                await fetchAPI(config.endpoints.patients, { method: 'POST', body: JSON.stringify(payload) });
                showSuccess('Patient ajouté !');
            }
            hideForm('patient-form-container');
            resetPatientForm();
            loadPatients();
            loadDashboardData();
        } catch (err) { /* error already shown */ }
    };

    // ========== CRUD RENDEZ-VOUS ==========

    const editRdv = (id) => {
        const r = state.appointments.find(x => x.id === id);
        if (!r) return;
        document.getElementById('rdv-id').value = id;
        document.getElementById('rdv-patient').value = r.patient_nom || r.patient || '';
        document.getElementById('rdv-medecin').value = r.medecin || '';
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
            patient:  document.getElementById('rdv-patient').value.trim(),
            medecin:  document.getElementById('rdv-medecin').value,
            date:     document.getElementById('rdv-date').value,
            heure:    document.getElementById('rdv-heure').value,
            motif:    document.getElementById('rdv-motif').value.trim(),
            statut:   document.getElementById('rdv-statut').value,
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
            doctor:  `Supprimer Dr. ${label} ? Cette action est irréversible.`,
            patient: `Supprimer le patient ${label} ? Toutes ses données seront perdues.`,
            rdv:     `Supprimer ${label} ?`,
        };
        document.getElementById('delete-modal-text').textContent = textMap[type] || 'Supprimer cet élément ?';
        document.getElementById('delete-modal').style.display = 'flex';
    };

    const executeDelete = async () => {
        const { type, id } = state.deleteTarget;
        const endpointMap = {
            doctor:  config.endpoints.doctors,
            patient: config.endpoints.patients,
            rdv:     config.endpoints.appointments,
        };
        const endpoint = endpointMap[type];
        if (!endpoint || !id) return;

        try {
            await fetchAPI(`${endpoint}${id}/`, { method: 'DELETE' });
            showSuccess('Supprimé avec succès !');
            closeDeleteModal();

            if (type === 'doctor')  { loadDoctors(); loadDashboardData(); }
            if (type === 'patient') { loadPatients(); loadDashboardData(); }
            if (type === 'rdv')     { loadAppointments(state.rdvDate); loadDashboardData(); }
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
        // Label de la page RDV
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
                if (state.currentSection === 'doctors') {
                    state.filteredDoctors = state.doctors.filter(d =>
                        `${d.nom} ${d.prenom} ${d.specialite}`.toLowerCase().includes(term));
                    renderDoctorTable();
                } else if (state.currentSection === 'patients') {
                    state.filteredPatients = state.patients.filter(p =>
                        `${p.nom} ${p.prenom}`.toLowerCase().includes(term));
                    renderPatientTable();
                }
            });
        }

        // === MÉDECINS ===
        const btnAddDoctor = document.getElementById('btn-add-doctor');
        if (btnAddDoctor) btnAddDoctor.addEventListener('click', () => {
            resetDoctorForm();
            showForm('doctor-form-container');
        });

        const btnCloseDoctorForm = document.getElementById('btn-close-doctor-form');
        if (btnCloseDoctorForm) btnCloseDoctorForm.addEventListener('click', () => hideForm('doctor-form-container'));

        const btnCancelDoctor = document.getElementById('btn-cancel-doctor');
        if (btnCancelDoctor) btnCancelDoctor.addEventListener('click', () => { resetDoctorForm(); hideForm('doctor-form-container'); });

        const formDoctor = document.getElementById('formDoctor');
        if (formDoctor) formDoctor.addEventListener('submit', submitDoctorForm);

        const doctorSearch = document.getElementById('doctor-search');
        if (doctorSearch) {
            doctorSearch.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                state.filteredDoctors = state.doctors.filter(d =>
                    `${d.nom} ${d.prenom} ${d.specialite}`.toLowerCase().includes(term));
                renderDoctorTable();
            });
        }

        // === PATIENTS ===
        const btnAddPatient = document.getElementById('btn-add-patient');
        if (btnAddPatient) btnAddPatient.addEventListener('click', () => {
            resetPatientForm();
            showForm('patient-form-container');
        });

        const btnClosePatientForm = document.getElementById('btn-close-patient-form');
        if (btnClosePatientForm) btnClosePatientForm.addEventListener('click', () => hideForm('patient-form-container'));

        const btnCancelPatient = document.getElementById('btn-cancel-patient');
        if (btnCancelPatient) btnCancelPatient.addEventListener('click', () => { resetPatientForm(); hideForm('patient-form-container'); });

        const formPatient = document.getElementById('formPatient');
        if (formPatient) formPatient.addEventListener('submit', submitPatientForm);

        const patientSearch = document.getElementById('patient-search');
        if (patientSearch) {
            patientSearch.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                state.filteredPatients = state.patients.filter(p =>
                    `${p.nom} ${p.prenom}`.toLowerCase().includes(term));
                renderPatientTable();
            });
        }

        // === RENDEZ-VOUS ===
        const btnAddRdv = document.getElementById('btn-add-rdv');
        if (btnAddRdv) btnAddRdv.addEventListener('click', () => {
            resetRdvForm();
            showForm('rdv-form-container');
        });

        const btnCloseRdvForm = document.getElementById('btn-close-rdv-form');
        if (btnCloseRdvForm) btnCloseRdvForm.addEventListener('click', () => hideForm('rdv-form-container'));

        const btnCancelRdv = document.getElementById('btn-cancel-rdv');
        if (btnCancelRdv) btnCancelRdv.addEventListener('click', () => { resetRdvForm(); hideForm('rdv-form-container'); });

        const formRdv = document.getElementById('formRdv');
        if (formRdv) formRdv.addEventListener('submit', submitRdvForm);

        // Navigation date
        const filterDate = document.getElementById('rdv-filter-date');
        if (filterDate) {
            filterDate.value = formatDateInput(state.rdvDate);
            filterDate.addEventListener('change', (e) => {
                state.rdvDate = new Date(e.target.value);
                setCurrentDate();
                loadAppointments(state.rdvDate);
            });
        }

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
        console.log('Initialisation Dashboard Secrétaire...');
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
        editDoctor,
        editPatient,
        editRdv,
        confirmDelete,
        getState: () => state,
    };

})();

document.addEventListener('DOMContentLoaded', DashboardSecr.init);
