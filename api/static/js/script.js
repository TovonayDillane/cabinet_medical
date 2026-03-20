/**
 * Dashboard Médecin - Application principale
 * Gestion de l'interface utilisateur et communication avec le backend Django
 */

const Dashboard = (() => {
    // ========== CONFIGURATION ==========
    const config = {
        apiBaseUrl: '/api', // À adapter selon votre configuration Django
        endpoints: {
            patients: '/patients/',
            dashboard: '/dashboard/',
            prescriptions: '/prescriptions/',
            user: '/user/',
            logout: '/logout/',
        },
        selectors: {
            contentSections: '.content-section',
            navItem: '.nav-item',
            patientSearch: '#patientSearch',
            patientTable: '#patientTable',
            patientTableBody: '#patientTableBody',
            formPrescription: '#formPrescription',
            logoutBtn: '#logoutBtn',
            username: '#username',
            totalPatients: '#total-patients',
            waitingPatients: '#waiting-patients',
        },
    };

    // ========== ÉTAT ==========
    let state = {
        currentSection: 'dashboard',
        isLoading: false,
        patients: [],
        filteredPatients: [],
        currentUser: null,
    };

    // ========== UTILITAIRES ==========
    /**
     * Affiche un message d'erreur utilisateur
     * @param {string} message - Le message d'erreur
     */
    const showError = (message) => {
        console.error(message);
        alert(`Erreur: ${message}`);
    };

    /**
     * Affiche un message de succès
     * @param {string} message - Le message de succès
     */
    const showSuccess = (message) => {
        console.log(message);
        // À améliorer avec une notification toast
        alert(message);
    };

    /**
     * Affiche/masque un loader
     * @param {boolean} show - Afficher ou masquer
     */
    const setLoading = (show) => {
        state.isLoading = show;
        // À implémenter avec un vrai spinner
        if (show) console.log('Chargement...');
    };

    // ========== API REQUESTS ==========
    /**
     * Effectue une requête fetch vers le backend
     * @param {string} endpoint - L'endpoint API
     * @param {object} options - Options fetch additionnelles
     * @returns {Promise}
     */
    const fetchAPI = async (endpoint, options = {}) => {
        const url = `${config.apiBaseUrl}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'include', // Pour les cookies de session
        };

        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            if (!response.ok) {
                throw new Error(`Erreur ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            showError(error.message);
            throw error;
        }
    };

    /**
     * Charge les données du dashboard (statistiques)
     */
    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const data = await fetchAPI(config.endpoints.dashboard);
            document.querySelector(config.selectors.totalPatients).textContent = data.total_patients || 0;
            document.querySelector(config.selectors.waitingPatients).textContent = data.waiting_patients || 0;
        } catch (error) {
            console.error('Erreur lors du chargement du dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Charge la liste des patients
     */
    const loadPatients = async () => {
        setLoading(true);
        try {
            const data = await fetchAPI(config.endpoints.patients);
            // Gérer les différents formats de réponse API
            const patients = Array.isArray(data) ? data : (data.results || []);
            state.patients = patients;
            state.filteredPatients = [...state.patients];
            renderPatientTable();
        } catch (error) {
            console.error('Erreur lors du chargement des patients:', error);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Charge les données utilisateur
     */
    const loadUserProfile = async () => {
        try {
            const data = await fetchAPI(config.endpoints.user);
            state.currentUser = data;
            const userElement = document.querySelector(config.selectors.username);
            if (userElement) {
                userElement.textContent = data.first_name || data.username || '-';
            }
        } catch (error) {
            console.error('Erreur lors du chargement du profil:', error);
        }
    };

    // ========== TABLEAU PATIENTS ==========
    /**
     * Rend le tableau des patients
     */
    const renderPatientTable = () => {
        const tbody = document.querySelector(config.selectors.patientTableBody);
        if (!tbody) return;

        tbody.innerHTML = '';

        if (state.filteredPatients.length === 0) {
            tbody.innerHTML = '<tr class="placeholder-row"><td colspan="4" style="text-align: center; padding: 40px;\"><i class=\"fas fa-inbox\" style=\"font-size: 2rem; display: block; margin-bottom: 10px; color: #94a3b8;\"></i><span style=\"color: #94a3b8;\">Aucun patient trouvé</span></td></tr>';
            return;
        }

        state.filteredPatients.forEach(patient => {
            const row = createPatientRow(patient);
            tbody.appendChild(row);
        });
    };

    /**
     * Crée une ligne de tableau pour un patient
     * @param {object} patient - Les données du patient
     * @returns {HTMLElement}
     */
    const createPatientRow = (patient) => {
        const row = document.createElement('tr');
        const statusClass = patient.status === 'completed' ? 'green' : 'orange';
        const statusText = patient.status === 'completed' ? 'Terminé' : 'En attente';
        
        row.innerHTML = `
            <td>${patient.name || patient.first_name + ' ' + patient.last_name}</td>
            <td>${formatDate(patient.last_visit || patient.last_appointment)}</td>
            <td><span class="status ${statusClass}">${statusText}</span></td>
            <td><button class="btn-view" onclick="Dashboard.viewPatient(${patient.id})">Voir</button></td>
        `;
        return row;
    };

    /**
     * Formate une date en format lisible
     * @param {string} dateString - La date à formater
     * @returns {string}
     */
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR');
    };

    /**
     * Filtre les patients selon la recherche
     * @param {string} searchTerm - Terme de recherche
     */
    const filterPatients = (searchTerm) => {
        const term = searchTerm.toLowerCase();
        state.filteredPatients = state.patients.filter(patient => {
            const fullName = `${patient.name || patient.first_name} ${patient.last_name || ''}`.toLowerCase();
            return fullName.includes(term);
        });
        renderPatientTable();
    };

    /**
     * Affiche les détails d'un patient
     * @param {number} patientId - L'ID du patient
     */
    const viewPatient = (patientId) => {
        alert(`Voir détails du patient ${patientId}`);
        // À implémenter: afficher une modale avec les détails
    };

    // ========== NAVIGATION ==========
    /**
     * Change de section
     * @param {string} sectionId - L'ID de la section
     */
    const showSection = (sectionId) => {
        // Masquer toutes les sections
        document.querySelectorAll(config.selectors.contentSections).forEach(section => {
            section.classList.remove('active');
        });

        // Afficher la section demandée
        const targetSection = document.getElementById(`${sectionId}-section`);
        if (targetSection) {
            targetSection.classList.add('active');
        }

        // Mettre à jour le lien actif
        document.querySelectorAll(config.selectors.navItem).forEach(link => {
            link.classList.remove('active');
        });
        const activeLink = Array.from(document.querySelectorAll(config.selectors.navItem))
            .find(link => link.getAttribute('data-section') === sectionId);
        if (activeLink) activeLink.classList.add('active');

        state.currentSection = sectionId;

        // Charger les données spécifiques à la section
        if (sectionId === 'dashboard') {
            loadDashboardData();
            loadPatients();
        }
    };

    // ========== AUTHENTIFICATION ==========
    /**
     * Déconnecte l'utilisateur
     */
    const logout = async () => {
        if (!confirm('Voulez-vous vraiment vous déconnecter ?')) return;

        try {
            // Appelle l'endpoint de déconnexion Django
            window.location.href = config.endpoints.logout;
        } catch (error) {
            console.error('Erreur de déconnexion:', error);
            window.location.href = config.endpoints.logout;
        }
    };

    // ========== FORMULAIRES ==========
    /**
     * Envoie une prescription au serveur
     * @param {FormData} formData - Les données du formulaire
     */
    const submitPrescription = async (formData) => {
        setLoading(true);
        try {
            const data = Object.fromEntries(formData);
            await fetchAPI(config.endpoints.prescriptions, {
                method: 'POST',
                body: JSON.stringify(data),
            });
            showSuccess('Prescription enregistrée avec succès !');
            showSection('dashboard');
        } catch (error) {
            showError('Erreur lors de l\'enregistrement de la prescription');
        } finally {
            setLoading(false);
        }
    };

    // ========== EVENT LISTENERS ==========
    /**
     * Initialise tous les event listeners
     */
    const initEventListeners = () => {
        // Navigation sidebar
        document.querySelectorAll(config.selectors.navItem).forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.getAttribute('data-section');
                if (section) showSection(section);
            });
        });

        // Recherche de patients
        const searchInput = document.querySelector(config.selectors.patientSearch);
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                filterPatients(e.target.value);
            });
        }

        // Bouton de déconnexion
        const logoutBtn = document.querySelector(config.selectors.logoutBtn);
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }

        // Formulaire prescription
        const form = document.querySelector(config.selectors.formPrescription);
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(form);
                submitPrescription(formData);
            });
        }
    };

    // ========== INITIALISATION ==========
    /**
     * Initialise l'application
     */
    const init = async () => {
        console.log('Initialisation du Dashboard...');
        await loadUserProfile();
        await loadDashboardData();
        await loadPatients();
        initEventListeners();
        // Affiche la section dashboard au démarrage
        showSection('dashboard');
    };

    // ========== API PUBLIQUE ==========
    return {
        init,
        showSection,
        viewPatient,
        filterPatients,
        logout,
        // Exposition de certaines fonctions pour le debugging
        getState: () => state,
        getConfig: () => config,
    };
})();

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', Dashboard.init);