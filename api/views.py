from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib import messages
from .models import Medecin, Secretaire
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
import json
from datetime import datetime, timedelta, date
import logging
import traceback

logger = logging.getLogger(__name__)

def error_response(message, status=500):
    """Crée une réponse d'erreur avec logging"""
    logger.error(message)
    return JsonResponse({'error': message}, status=status)

# Create your views here.

@never_cache
def login_views(request):
    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        mdp = request.POST.get("password", "")
        
        if not username:
            messages.error(request, "Veuillez entrer votre nom d'utilisateur")
        elif not mdp:
            messages.error(request, "Veuillez entrer votre mot de passe")
        else:
            # Vérifier si l'utilisateur existe
            user_exists = User.objects.filter(username=username).exists()
            
            if not user_exists:
                messages.error(request, "Cet utilisateur n'existe pas. Veuillez vérifier votre nom d'utilisateur.")
            else:
                # L'utilisateur existe, vérifier le mot de passe
                user = authenticate(request, username=username, password=mdp)
                if user is not None:
                    login(request, user)
                    # Récupérer l'URL de redirection depuis le paramètre 'next'
                    next_url = request.POST.get('next') or request.GET.get('next')
                    if next_url:
                        return redirect(next_url)
                    # Sinon, rediriger selon le type d'utilisateur
                    if hasattr(user, 'profil_medecin'):
                        return redirect('dashboard_med')
                    elif hasattr(user, 'profil_secretaire'):
                        return redirect('dashboard_secre')
                    else:
                        return redirect('/admin')
                else:
                    messages.error(request, "Mot de passe incorrect. Veuillez réessayer.")
    
    # Récupérer le paramètre 'next' pour le passer au template
    next_url = request.GET.get('next', '')
    context = {'next': next_url}
    return render(request, 'api/login.html', context)

@login_required(login_url='login_views')
@never_cache
def dashboard_med(request):
    return render(request, 'api/dashboard_med.html')

@login_required(login_url='login_views')
@never_cache
def dashboard_secre(request):
    return render(request, 'api/dashboard_secre.html')

# ========== API DASHBOARD SECRÉTAIRE ==========

@login_required(login_url='login_views')
def dashboard_secretaire_api(request):
    """API pour les statistiques du dashboard secrétaire"""
    from .models import Patient, RendezVous
    from django.utils import timezone
    
    today = timezone.now().date()
    
    data = {
        'rdv_today': RendezVous.objects.filter(date=today).count(),
        'rdv_waiting': RendezVous.objects.filter(date=today).count(),  # À adapter selon le modèle
        'total_doctors': Medecin.objects.count(),
        'total_patients': Patient.objects.count(),
    }
    return JsonResponse(data)

# ========== API DASHBOARD MÉDECIN ==========

@login_required(login_url='login_views')
def dashboard_medecin_api(request):
    """API pour les statistiques du dashboard médecin"""
    from .models import Patient, Consultation, Prescription, RendezVous
    from django.utils import timezone
    
    today = timezone.now().date()
    medecin = Medecin.objects.filter(user=request.user).first()
    
    if not medecin:
        return JsonResponse({'error': 'Médecin non trouvé'}, status=404)
    
    data = {
        'patients_today': Patient.objects.count(),
        'patients_waiting': RendezVous.objects.filter(medecin= medecin, statut= 'attente').count(),
        'consultations_completed': Consultation.objects.filter(medecin=medecin).count(),
        'prescriptions_today': Prescription.objects.count(),
        'rdv_waiting': RendezVous.objects.filter(medecin=medecin, date=today).count(),
    }
    return JsonResponse(data)

@login_required(login_url='login_views')
@never_cache
def logout_view(request):
    logout(request) # Détruit la session
    return redirect('login_views')

# ========== API MÉDECINS ==========

@login_required(login_url='login_views')
@require_http_methods(["GET", "POST"])
def medecins_list_api(request):
    """Liste tous les médecins ou crée un nouveau médecin"""
    if request.method == 'GET':
        medecins = Medecin.objects.all().select_related('user')
        data = []
        for med in medecins:
            data.append({
                'id': med.id,
                'user_id': med.user.id,
                'user_username': med.user.username,
                'user_first_name': med.user.first_name,
                'user_last_name': med.user.last_name,
                'user_email': med.user.email,
                'specialite': med.specialite,
                'statue': med.statue,
            })
        return JsonResponse(data, safe=False)
    
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            
            # Créer ou récupérer l'utilisateur
            username = data.get('user_username', '').strip()
            if not username:
                return JsonResponse({'error': 'Username obligatoire'}, status=400)
            
            # Vérifier si l'utilisateur existe déjà
            if User.objects.filter(username=username).exists():
                return JsonResponse({'error': 'Cet utilisateur existe déjà'}, status=400)
            
            # Créer l'utilisateur
            user = User.objects.create_user(
                username=username,
                email=data.get('user_email', '').strip(),
                password=data.get('user_password', 'defaultpass123').strip() or 'defaultpass123',
                first_name=data.get('user_first_name', '').strip(),
                last_name=data.get('user_last_name', '').strip(),
            )
            
            # Créer le médecin
            medecin = Medecin.objects.create(
                user=user,
                specialite=data.get('specialite', '').strip(),
                statue=data.get('statue', 'DISPONIBLE'),
            )
            
            return JsonResponse({
                'id': medecin.id,
                'user_id': user.id,
                'user_username': user.username,
                'user_first_name': user.first_name,
                'user_last_name': user.last_name,
                'user_email': user.email,
                'specialite': medecin.specialite,
                'statue': medecin.statue,
            }, status=201)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

@login_required(login_url='login_views')
@require_http_methods(["GET", "PUT", "DELETE"])
def medecin_detail_api(request, pk):
    """Récupère, modifie ou supprime un médecin"""
    try:
        medecin = Medecin.objects.get(pk=pk)
    except Medecin.DoesNotExist:
        return JsonResponse({'error': 'Médecin non trouvé'}, status=404)
    
    if request.method == 'GET':
        return JsonResponse({
            'id': medecin.id,
            'user_id': medecin.user.id,
            'user_username': medecin.user.username,
            'user_first_name': medecin.user.first_name,
            'user_last_name': medecin.user.last_name,
            'user_email': medecin.user.email,
            'specialite': medecin.specialite,
            'statue': medecin.statue,
        })
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            user = medecin.user
            
            # Mettre à jour l'utilisateur
            if 'user_first_name' in data:
                fname = data.get('user_first_name', '').strip()
                if fname and len(fname) <= 150:
                    user.first_name = fname
                elif fname and len(fname) > 150:
                    return JsonResponse({'error': 'Prénom trop long (max 150 caractères)'}, status=400)
            if 'user_last_name' in data:
                lname = data.get('user_last_name', '').strip()
                if lname and len(lname) <= 150:
                    user.last_name = lname
                elif lname and len(lname) > 150:
                    return JsonResponse({'error': 'Nom trop long (max 150 caractères)'}, status=400)
            if 'user_email' in data:
                email = data.get('user_email', '').strip()
                if email:
                    # Vérifier que l'email n'existe pas déjà
                    if User.objects.filter(email=email).exclude(pk=user.id).exists():
                        return JsonResponse({'error': 'Cet email est déjà utilisé'}, status=400)
                    user.email = email
            if 'user_password' in data and data.get('user_password', '').strip():
                pwd = data.get('user_password', '').strip()
                if len(pwd) < 8:
                    return JsonResponse({'error': 'Le mot de passe doit avoir au moins 8 caractères'}, status=400)
                user.set_password(pwd)
            
            user.save()
            
            # Mettre à jour le médecin
            if 'specialite' in data:
                spec = data.get('specialite', '').strip()
                if spec and spec in dict(Medecin.SPECIALISTE_CHOICES):
                    medecin.specialite = spec
                else:
                    return JsonResponse({'error': 'Spécialité invalide'}, status=400)
            if 'statue' in data:
                statue = data.get('statue', '').strip()
                if statue and statue in dict(Medecin.STATUE_CHOICES):
                    medecin.statue = statue
                else:
                    return JsonResponse({'error': 'Statut invalide'}, status=400)
            
            medecin.save()
            
            return JsonResponse({
                'id': medecin.id,
                'user_id': user.id,
                'user_username': user.username,
                'user_first_name': user.first_name,
                'user_last_name': user.last_name,
                'user_email': user.email,
                'specialite': medecin.specialite,
                'statue': medecin.statue,
            })
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    
    elif request.method == 'DELETE':
        try:
            user_id = medecin.user.id
            medecin.delete()
            # Optionnel: supprimer aussi l'utilisateur
            # User.objects.filter(id=user_id).delete()
            return JsonResponse({'message': 'Médecin supprimé avec succès'}, status=204)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

# ========== API PATIENTS ==========

@login_required(login_url='login_views')
@require_http_methods(["GET", "POST"])
def patients_list_api(request):
    """Liste les patients (filtrés par médecin si l'utilisateur est médecin)"""
    if request.method == 'GET':
        from .models import Patient, RendezVous, Consultation
        from django.db.models import Q
        
        patients = Patient.objects.all()
        
        # Filtrer par médecin si l'utilisateur est un médecin
        medecin = Medecin.objects.filter(user=request.user).first()
        if medecin:
            # Afficher seulement les patients ayant un RDV ou une consultation avec ce médecin
            patients = patients.filter(
                Q(rendezvous__medecin=medecin) | Q(consultation__medecin=medecin)
            ).distinct()
        data = []
        for patient in patients:
            data.append({
                'id': patient.id,
                'nom': patient.nom,
                'prenom': patient.prenom,
                'date_naissance': patient.date_naissance.isoformat() if patient.date_naissance else None,
                'sexe': patient.sexe,
                'telephone': patient.telephone,
                'adresse': patient.adresse,
                'groupe_sanguin': patient.groupe_sanguin,
                'allergie': patient.allergie,
            })
        return JsonResponse(data, safe=False)
    
    elif request.method == 'POST':
        try:
            from .models import Patient
            data = json.loads(request.body)
            
            patient = Patient.objects.create(
                nom=data.get('nom', '').strip(),
                prenom=data.get('prenom', '').strip(),
                date_naissance=data.get('date_naissance'),
                sexe=data.get('sexe', '').strip(),
                telephone=data.get('telephone', '').strip(),
                adresse=data.get('adresse', '').strip(),
                groupe_sanguin=data.get('groupe_sanguin', '').strip(),
                allergie=data.get('allergie', '').strip(),
            )
            
            return JsonResponse({
                'id': patient.id,
                'nom': patient.nom,
                'prenom': patient.prenom,
                'date_naissance': patient.date_naissance.isoformat() if patient.date_naissance else None,
                'sexe': patient.sexe,
                'telephone': patient.telephone,
                'adresse': patient.adresse,
                'groupe_sanguin': patient.groupe_sanguin,
                'allergie': patient.allergie,
            }, status=201)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

@login_required(login_url='login_views')
@require_http_methods(["GET", "PUT", "DELETE"])
def patient_detail_api(request, pk):
    """Récupère, modifie ou supprime un patient"""
    from .models import Patient
    try:
        patient = Patient.objects.get(pk=pk)
    except Patient.DoesNotExist:
        return JsonResponse({'error': 'Patient non trouvé'}, status=404)
    
    if request.method == 'GET':
        return JsonResponse({
            'id': patient.id,
            'nom': patient.nom,
            'prenom': patient.prenom,
            'date_naissance': patient.date_naissance.isoformat() if patient.date_naissance else None,
            'sexe': patient.sexe,
            'telephone': patient.telephone,
            'adresse': patient.adresse,
            'groupe_sanguin': patient.groupe_sanguin,
            'allergie': patient.allergie,
        })
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            
            if 'nom' in data:
                patient.nom = data.get('nom', '').strip()
            if 'prenom' in data:
                patient.prenom = data.get('prenom', '').strip()
            if 'date_naissance' in data:
                date_value = data.get('date_naissance', '').strip()
                if date_value:
                    try:
                        patient.date_naissance = datetime.strptime(date_value, '%Y-%m-%d').date()
                    except ValueError:
                        return JsonResponse({'error': 'Format date invalide (YYYY-MM-DD)'}, status=400)
            if 'sexe' in data:
                sexe_value = data.get('sexe', '').strip()
                if sexe_value and sexe_value in dict(Patient.SEXE_CHOICES):
                    patient.sexe = sexe_value
                else:
                    return JsonResponse({'error': 'Sexe invalide. Valeurs: H, F'}, status=400)
            if 'telephone' in data:
                patient.telephone = data.get('telephone', '').strip()
            if 'adresse' in data:
                patient.adresse = data.get('adresse', '').strip()
            if 'groupe_sanguin' in data:
                groupe_value = data.get('groupe_sanguin', '').strip()
                if groupe_value and groupe_value in dict(Patient.GROUPE_SANGUIN_CHOICES):
                    patient.groupe_sanguin = groupe_value
                else:
                    return JsonResponse({'error': 'Groupe sanguin invalide. Valeurs: A, B, O, AB'}, status=400)
            if 'allergie' in data:
                patient.allergie = data.get('allergie', '').strip()
            
            patient.save()
            
            return JsonResponse({
                'id': patient.id,
                'nom': patient.nom,
                'prenom': patient.prenom,
                'date_naissance': patient.date_naissance.isoformat() if patient.date_naissance else None,
                'sexe': patient.sexe,
                'telephone': patient.telephone,
                'adresse': patient.adresse,
                'groupe_sanguin': patient.groupe_sanguin,
                'allergie': patient.allergie,
            })
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    
    elif request.method == 'DELETE':
        try:
            patient.delete()
            return JsonResponse({'message': 'Patient supprimé avec succès'}, status=204)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

# ========== API USER ==========

@login_required(login_url='login_views')
def user_profile_api(request):
    """Récupère le profil de l'utilisateur conecté"""
    user = request.user
    return JsonResponse({
        'id': user.id,
        'username': user.username,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'email': user.email,
    })

# ========== API CONSULTATIONS ==========

@login_required(login_url='login_views')
@require_http_methods(["GET", "POST"])
def consultations_list_api(request):
    """Liste les consultations (filtrées par médecin si l'utilisateur est médecin)"""
    from .models import Consultation, Patient
    
    if request.method == 'GET':
        consultations = Consultation.objects.all().select_related('patient', 'medecin')
        
        # Filtrer par médecin si l'utilisateur est un médecin
        medecin = Medecin.objects.filter(user=request.user).first()
        if medecin:
            consultations = consultations.filter(medecin=medecin)
        data = []
        for cons in consultations:
            data.append({
                'id': cons.id,
                'patient': cons.patient.id,
                'patient_nom': f"{cons.patient.nom} {cons.patient.prenom}",
                'medecin': cons.medecin.id,
                'medecin_nom': f"Dr. {cons.medecin.user.first_name} {cons.medecin.user.last_name}",
                'date': cons.date.isoformat() if cons.date else None,
                'symptome': cons.symptome,
                'diagnostic': cons.diagnostic,
            })
        return JsonResponse(data, safe=False)
    
    elif request.method == 'POST':
        try:
            logger.debug(f"POST Consultation reçu de {request.user}")
            data = json.loads(request.body)
            logger.debug(f"Données reçues: {data}")
            
            # Récupérer le patient et le médecin
            patient_name = data.get('patient', '').strip().split()
            medecin = Medecin.objects.filter(user=request.user).first()
            
            logger.debug(f"Nom du patient: {patient_name}, Médecin: {medecin}")
            
            if not patient_name or not medecin:
                logger.error(f"Données invalides - patient_name: {patient_name}, medecin: {medecin}")
                return JsonResponse({'error': 'Données invalides: patient ou médecin manquant'}, status=400)
            
            # Trouver le patient par nom
            from django.db.models import Q
            patient = Patient.objects.filter(
                Q(nom=patient_name[0]) if len(patient_name) > 0 else Q(nom='')
            ).first()
            
            if not patient:
                logger.error(f"Patient '{patient_name[0]}' non trouvé")
                available_patients = Patient.objects.values_list('nom', 'prenom')
                logger.debug(f"Patients disponibles: {list(available_patients)}")
                return JsonResponse({'error': f'Patient \'{patient_name[0]}\' non trouvé'}, status=404)
            
            consultation = Consultation.objects.create(
                patient=patient,
                medecin=medecin,
                symptome=data.get('symptome', '').strip(),
                diagnostic=data.get('diagnostic', '').strip(),
            )
            logger.debug(f"Consultation créée: {consultation.id}")
            
            return JsonResponse({
                'id': consultation.id,
                'patient': patient.id,
                'patient_nom': f"{patient.nom} {patient.prenom}",
                'medecin': medecin.id,
                'medecin_nom': f"Dr. {medecin.user.first_name} {medecin.user.last_name}",
                'date': consultation.date.isoformat() if consultation.date else None,
                'symptome': consultation.symptome,
                'diagnostic': consultation.diagnostic,
            }, status=201)
        except json.JSONDecodeError as e:
            logger.error(f"JSON invalide: {e}")
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            logger.error(f"Erreur consultation POST: {str(e)}\n{traceback.format_exc()}")
            return JsonResponse({'error': f'Erreur serveur: {str(e)}'}, status=500)

@login_required(login_url='login_views')
@require_http_methods(["GET", "PUT", "DELETE"])
def consultation_detail_api(request, pk):
    """Récupère, modifie ou supprime une consultation"""
    from .models import Consultation, Patient
    
    try:
        consultation = Consultation.objects.get(pk=pk)
    except Consultation.DoesNotExist:
        return JsonResponse({'error': 'Consultation non trouvée'}, status=404)
    
    if request.method == 'GET':
        return JsonResponse({
            'id': consultation.id,
            'patient': consultation.patient.id,
            'patient_nom': f"{consultation.patient.nom} {consultation.patient.prenom}",
            'medecin': consultation.medecin.id,
            'medecin_nom': f"Dr. {consultation.medecin.user.first_name} {consultation.medecin.user.last_name}",
            'date': consultation.date.isoformat() if consultation.date else None,
            'symptome': consultation.symptome,
            'diagnostic': consultation.diagnostic,
        })
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            
            if 'symptome' in data:
                symptome = data.get('symptome', '').strip()
                if symptome:
                    consultation.symptome = symptome
                else:
                    return JsonResponse({'error': 'Symptôme ne peut pas être vide'}, status=400)
            if 'diagnostic' in data:
                diagnostic = data.get('diagnostic', '').strip()
                if diagnostic:
                    consultation.diagnostic = diagnostic
                else:
                    return JsonResponse({'error': 'Diagnostic ne peut pas être vide'}, status=400)
            
            consultation.save()
            
            return JsonResponse({
                'id': consultation.id,
                'patient': consultation.patient.id,
                'patient_nom': f"{consultation.patient.nom} {consultation.patient.prenom}",
                'medecin': consultation.medecin.id,
                'medecin_nom': f"Dr. {consultation.medecin.user.first_name} {consultation.medecin.user.last_name}",
                'date': consultation.date.isoformat() if consultation.date else None,
                'symptome': consultation.symptome,
                'diagnostic': consultation.diagnostic,
            })
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    
    elif request.method == 'DELETE':
        consultation.delete()
        return JsonResponse({'message': 'Consultation supprimée'}, status=204)

# ========== API PRESCRIPTIONS ==========

@login_required(login_url='login_views')
@require_http_methods(["GET", "POST"])
def prescriptions_list_api(request):
    """Liste les prescriptions (filtrées par médecin si l'utilisateur est médecin)"""
    from .models import Prescription, Consultation
    
    if request.method == 'GET':
        prescriptions = Prescription.objects.all().select_related('consultation', 'consultation__patient', 'consultation__medecin')
        
        # Filtrer par médecin si l'utilisateur est un médecin
        medecin = Medecin.objects.filter(user=request.user).first()
        if medecin:
            prescriptions = prescriptions.filter(consultation__medecin=medecin)
        data = []
        for pres in prescriptions:
            consul_date = pres.consultation.date.isoformat() if pres.consultation and pres.consultation.date else None
            medecin_name = f"Dr. {pres.consultation.medecin.user.first_name} {pres.consultation.medecin.user.last_name}" if pres.consultation and pres.consultation.medecin else '-'
            data.append({
                'id': pres.id,
                'consultation': pres.consultation.id if pres.consultation else None,
                'consultation_date': consul_date,
                'patient_nom': f"{pres.consultation.patient.nom} {pres.consultation.patient.prenom}" if pres.consultation else '-',
                'medecin_nom': medecin_name,
                'medications': pres.medicaments,
                'symptome': pres.consultation.symptome if pres.consultation else '',
                'diagnostic': pres.consultation.diagnostic if pres.consultation else '',
                'date': consul_date,
                'notes': '',
            })
        return JsonResponse(data, safe=False)
    
    elif request.method == 'POST':
        try:
            from .models import Consultation
            data = json.loads(request.body)
            
            consultation_id = data.get('consultation')
            if not consultation_id:
                return JsonResponse({'error': 'Consultation requise'}, status=400)
            
            try:
                consultation = Consultation.objects.get(pk=consultation_id)
            except Consultation.DoesNotExist:
                return JsonResponse({'error': 'Consultation non trouvée'}, status=404)
            
            prescription = Prescription.objects.create(
                consultation=consultation,
                medicaments=data.get('medications', '').strip(),
            )
            
            medecin_name = f"Dr. {consultation.medecin.user.first_name} {consultation.medecin.user.last_name}" if consultation.medecin else '-'
            return JsonResponse({
                'id': prescription.id,
                'consultation': consultation.id,
                'consultation_date': consultation.date.isoformat() if consultation.date else None,
                'patient_nom': f"{consultation.patient.nom} {consultation.patient.prenom}",
                'medecin_nom': medecin_name,
                'medications': prescription.medicaments,
                'symptome': consultation.symptome,
                'diagnostic': consultation.diagnostic,
                'date': consultation.date.isoformat() if consultation.date else None,
                'notes': '',
            }, status=201)
        except json.JSONDecodeError as e:
            logger.error(f"JSON invalide dans prescription POST: {e}")
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            logger.error(f"Erreur prescription POST: {str(e)}\n{traceback.format_exc()}")
            return JsonResponse({'error': f'Erreur serveur: {str(e)}'}, status=500)

@login_required(login_url='login_views')
@require_http_methods(["GET", "PUT", "DELETE"])
def prescription_detail_api(request, pk):
    """Récupère, modifie ou supprime une prescription"""
    from .models import Prescription
    
    try:
        prescription = Prescription.objects.get(pk=pk)
    except Prescription.DoesNotExist:
        return JsonResponse({'error': 'Prescription non trouvée'}, status=404)
    
    if request.method == 'GET':
        medecin_name = f"Dr. {prescription.consultation.medecin.user.first_name} {prescription.consultation.medecin.user.last_name}" if prescription.consultation and prescription.consultation.medecin else '-'
        return JsonResponse({
            'id': prescription.id,
            'consultation': prescription.consultation.id,
            'consultation_date': prescription.consultation.date.isoformat() if prescription.consultation and prescription.consultation.date else None,
            'patient_nom': f"{prescription.consultation.patient.nom} {prescription.consultation.patient.prenom}" if prescription.consultation else '-',
            'medecin_nom': medecin_name,
            'medications': prescription.medicaments,
            'symptome': prescription.consultation.symptome if prescription.consultation else '',
            'diagnostic': prescription.consultation.diagnostic if prescription.consultation else '',
            'date': prescription.consultation.date.isoformat() if prescription.consultation and prescription.consultation.date else None,
            'notes': '',
        })
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            
            if 'medications' in data:
                medications = data.get('medications', '').strip()
                if medications:
                    prescription.medicaments = medications
                else:
                    return JsonResponse({'error': 'Médicaments ne peuvent pas être vides'}, status=400)
            
            prescription.save()
            
            medecin_name = f"Dr. {prescription.consultation.medecin.user.first_name} {prescription.consultation.medecin.user.last_name}" if prescription.consultation and prescription.consultation.medecin else '-'
            return JsonResponse({
                'id': prescription.id,
                'consultation': prescription.consultation.id,
                'consultation_date': prescription.consultation.date.isoformat() if prescription.consultation and prescription.consultation.date else None,
                'patient_nom': f"{prescription.consultation.patient.nom} {prescription.consultation.patient.prenom}" if prescription.consultation else '-',
                'medecin_nom': medecin_name,
                'medications': prescription.medicaments,
                'symptome': prescription.consultation.symptome if prescription.consultation else '',
                'diagnostic': prescription.consultation.diagnostic if prescription.consultation else '',
                'date': prescription.consultation.date.isoformat() if prescription.consultation and prescription.consultation.date else None,
                'notes': '',
            })
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    
    elif request.method == 'DELETE':
        prescription.delete()
        return JsonResponse({'message': 'Prescription supprimée'}, status=204)

# ========== API RENDEZ-VOUS ==========

@login_required(login_url='login_views')
@require_http_methods(["GET", "POST"])
def rendezvous_list_api(request):
    """Liste les rendez-vous (filtrés par médecin si l'utilisateur est médecin)"""
    from .models import RendezVous, Patient
    from django.utils import timezone
    
    if request.method == 'GET':
        date_filter = request.GET.get('date')
        rdvs = RendezVous.objects.all().select_related('patient', 'medecin')
        
        # Filtrer par médecin si l'utilisateur est un médecin
        medecin = Medecin.objects.filter(user=request.user).first()
        if medecin:
            rdvs = rdvs.filter(medecin=medecin)
        
        if date_filter:
            rdvs = rdvs.filter(date=date_filter)
        
        data = []
        for rdv in rdvs:
            data.append({
                'id': rdv.id,
                'patient': rdv.patient.id,
                'patient_nom': f"{rdv.patient.nom} {rdv.patient.prenom}",
                'medecin': rdv.medecin.id,
                'medecin_nom': f"Dr. {rdv.medecin.user.first_name} {rdv.medecin.user.last_name}",
                'date': rdv.date.isoformat() if rdv.date else None,
                'heure': rdv.heure.strftime('%H:%M') if rdv.heure else None,
                'motif': rdv.motif,
                'statut': rdv.statut,
            })
        return JsonResponse(data, safe=False)
    
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            
            patient_name = data.get('patient', '').strip().split()
            medecin_id = data.get('medecin')
            
            if not patient_name:
                return JsonResponse({'error': 'Patient requis'}, status=400)
            
            # Déterminer le médecin
            medecin = Medecin.objects.filter(user=request.user).first()
            if not medecin:
                if not medecin_id:
                    return JsonResponse({'error': 'Médecin requis'}, status=400)
                try:
                    medecin = Medecin.objects.get(pk=medecin_id)
                except Medecin.DoesNotExist:
                    return JsonResponse({'error': 'Médecin non trouvé'}, status=404)
            
            from django.db.models import Q
            patient = Patient.objects.filter(
                Q(nom=patient_name[0]) if len(patient_name) > 0 else Q(nom='')
            ).first()
            
            if not patient:
                return JsonResponse({'error': 'Patient non trouvé'}, status=404)
            
            # Valider la date et l'heure
            heure_value = str(data.get('heure', '')).strip()
            date_value = str(data.get('date', '')).strip()
            
            if not heure_value:
                return JsonResponse({'error': 'Heure requise'}, status=400)
            if not date_value:
                return JsonResponse({'error': 'Date requise'}, status=400)
            
            try:
                heure = datetime.strptime(heure_value, '%H:%M').time()
                # Vérifier que la date est au bon format
                date_obj = datetime.strptime(date_value, '%Y-%m-%d').date()
            except ValueError as ve:
                logger.error(f"Erreur conversion date/heure: {ve}")
                return JsonResponse({'error': 'Format date invalide (YYYY-MM-DD) ou heure invalide (HH:MM)'}, status=400)
            
            # Tester si un rendez-vous existe déjà à cette heure
            marge_time = timedelta(minutes=10)
            heure_min = (datetime.combine(date.today(), heure) - marge_time).time()
            heure_max = (datetime.combine(date.today(), heure) + marge_time).time()
            
            collision = RendezVous.objects.filter(
                medecin=medecin,
                date=date_obj,
                heure__range=(heure_min, heure_max)
            ).exists()

            if collision:
                return JsonResponse({'error': 'Le médecin est déjà occupé à cette heure'}, status=400)
            
            rdv = RendezVous.objects.create(
                patient=patient,
                medecin=medecin,
                date=date_obj,
                heure=heure,
                motif=data.get('motif', '').strip(),
                statut=data.get('statut', 'attente'),
            )

            return JsonResponse({
                'id': rdv.id,
                'patient': patient.id,
                'patient_nom': f"{patient.nom} {patient.prenom}",
                'medecin': medecin.id,
                'medecin_nom': f"Dr. {medecin.user.first_name} {medecin.user.last_name}",
                'date': rdv.date.isoformat() if rdv.date else None,
                'heure': rdv.heure.strftime('%H:%M') if rdv.heure else None,
                'motif': rdv.motif,
                'statut': rdv.statut,
            }, status=201)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            logger.error(f"Erreur création RDV: {str(e)}", exc_info=True)
            return JsonResponse({'error': f'Erreur serveur: {str(e)}'}, status=500)

@login_required(login_url='login_views')
@require_http_methods(["GET", "PUT", "DELETE"])
def rendezvous_detail_api(request, pk):
    """Récupère, modifie ou supprime un rendez-vous"""
    from .models import RendezVous, Patient
    
    try:
        rdv = RendezVous.objects.get(pk=pk)
    except RendezVous.DoesNotExist:
        return JsonResponse({'error': 'Rendez-vous non trouvé'}, status=404)
    
    if request.method == 'GET':
        return JsonResponse({
            'id': rdv.id,
            'patient': rdv.patient.id,
            'patient_nom': f"{rdv.patient.nom} {rdv.patient.prenom}",
            'medecin': rdv.medecin.id,
            'medecin_nom': f"Dr. {rdv.medecin.user.first_name} {rdv.medecin.user.last_name}",
            'date': rdv.date.isoformat() if rdv.date else None,
            'heure': rdv.heure.strftime('%H:%M') if rdv.heure else None,
            'motif': getattr(rdv, 'motif', ''),
            'statut': getattr(rdv, 'statut', 'attente'),
        })
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            
            # Vérifier les permissions - le médecin ne peut modifier que ses propres RDV
            # Les secrétaires peuvent modifier tous les RDV
            medecin_connecte = Medecin.objects.filter(user=request.user).first()
            if medecin_connecte and rdv.medecin != medecin_connecte:
                return JsonResponse({'error': 'Vous ne pouvez modifier que vos propres rendez-vous'}, status=403)
            
            # Mettre à jour le patient si fourni
            if 'patient' in data:
                patient_name = str(data.get('patient', '')).strip().split()
                if patient_name:
                    from django.db.models import Q
                    patient = Patient.objects.filter(
                        Q(nom=patient_name[0]) if len(patient_name) > 0 else Q(nom='')
                    ).first()
                    if patient:
                        rdv.patient = patient
                    else:
                        return JsonResponse({'error': 'Patient non trouvé'}, status=404)
            
            # Mettre à jour la date et vérifier les collisions
            if 'date' in data or 'heure' in data:
                nouvelle_date = rdv.date
                nouvelle_heure = rdv.heure
                
                # Valider et convertir la date si fournie
                if 'date' in data:
                    date_value = str(data.get('date', '')).strip()
                    if not date_value:
                        return JsonResponse({'error': 'Date ne peut pas être vide'}, status=400)
                    try:
                        nouvelle_date = datetime.strptime(date_value, '%Y-%m-%d').date()
                    except ValueError:
                        return JsonResponse({'error': 'Format date invalide (YYYY-MM-DD)'}, status=400)
                
                # Valider et convertir l'heure en objet time si elle est fournie
                if 'heure' in data:
                    heure_value = str(data.get('heure', '')).strip()
                    if not heure_value:
                        return JsonResponse({'error': 'Heure ne peut pas être vide'}, status=400)
                    try:
                        nouvelle_heure = datetime.strptime(heure_value, '%H:%M').time()
                    except ValueError:
                        return JsonResponse({'error': 'Format heure invalide (HH:MM)'}, status=400)
                
                # Vérifier que date et heure ne sont pas None avant de vérifier les collisions
                if nouvelle_date is None:
                    return JsonResponse({'error': 'Date invalide ou manquante'}, status=400)
                if nouvelle_heure is None:
                    return JsonResponse({'error': 'Heure invalide ou manquante'}, status=400)
                
                # Vérifier les collisions avec la nouvelle date/heure
                marge_time = timedelta(minutes=10)
                heure_min = (datetime.combine(nouvelle_date, nouvelle_heure) - marge_time).time()
                heure_max = (datetime.combine(nouvelle_date, nouvelle_heure) + marge_time).time()
                
                collision = RendezVous.objects.filter(
                    medecin=rdv.medecin,
                    date=nouvelle_date,
                    heure__range=(heure_min, heure_max)
                ).exclude(pk=rdv.pk).exists()
                
                if collision:
                    return JsonResponse({'error': 'Le médecin est déjà occupé à cette heure'}, status=400)
                
                rdv.date = nouvelle_date
                rdv.heure = nouvelle_heure
            
            if 'motif' in data:
                rdv.motif = str(data.get('motif', ''))
            if 'statut' in data:
                statut_value = str(data.get('statut', '')).strip()
                # Accepter any statut string
                if statut_value:
                    rdv.statut = statut_value
            
            rdv.save()
            
            return JsonResponse({
                'id': rdv.id,
                'patient': rdv.patient.id,
                'patient_nom': f"{rdv.patient.nom} {rdv.patient.prenom}",
                'medecin': rdv.medecin.id,
                'medecin_nom': f"Dr. {rdv.medecin.user.first_name} {rdv.medecin.user.last_name}",
                'date': rdv.date.isoformat() if rdv.date else None,
                'heure': rdv.heure.strftime('%H:%M') if rdv.heure else None,
                'motif': rdv.motif,
                'statut': rdv.statut,
            })
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            logger.error(f"Erreur modification RDV: {str(e)}", exc_info=True)
            return JsonResponse({'error': f'Erreur serveur: {str(e)}'}, status=500)
    
    elif request.method == 'DELETE':
        try:
            # Vérifier les permissions - le médecin ne peut supprimer que ses propres RDV
            # Les secrétaires peuvent supprimer tous les RDV
            medecin_connecte = Medecin.objects.filter(user=request.user).first()
            if medecin_connecte and rdv.medecin != medecin_connecte:
                return JsonResponse({'error': 'Vous ne pouvez supprimer que vos propres rendez-vous'}, status=403)
            secretaire_connecte = Secretaire.objects.filter(user=request.user).first()
            if not medecin_connecte and not secretaire_connecte:
                return JsonResponse({'error': 'Accès non autorisé'}, status=403)
            
            rdv.delete()
            return JsonResponse({'message': 'Rendez-vous supprimé'}, status=204)
        except Exception as e:
            logger.error(f"Erreur suppression RDV: {str(e)}", exc_info=True)
            return JsonResponse({'error': f'Erreur serveur: {str(e)}'}, status=500)
