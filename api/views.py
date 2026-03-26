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
from datetime import datetime, timedelta

# Create your views here.

@never_cache
def login_views(request):
    if request.method == 'POST':
        username = request.POST.get('username') 
        mdp = request.POST.get("password")
        if username:
            user = authenticate(request, username=username, password=mdp)  # ✅ username au lieu de email
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
                messages.error(request, "Mot de passe incorrect ou utilisateur invalide")
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
                user.first_name = data.get('user_first_name', '').strip()
            if 'user_last_name' in data:
                user.last_name = data.get('user_last_name', '').strip()
            if 'user_email' in data:
                user.email = data.get('user_email', '').strip()
            if 'user_password' in data and data.get('user_password', '').strip():
                user.set_password(data.get('user_password'))
            
            user.save()
            
            # Mettre à jour le médecin
            if 'specialite' in data:
                medecin.specialite = data.get('specialite', '').strip()
            if 'statue' in data:
                medecin.statue = data.get('statue', medecin.statue)
            
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
    """Liste tous les patients ou crée un nouveau patient"""
    if request.method == 'GET':
        from .models import Patient
        patients = Patient.objects.all()
        data = []
        for patient in patients:
            data.append({
                'id': patient.id,
                'nom': patient.nom,
                'prenom': patient.prenom,
                'date_naissance': patient.date_naissance,
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
                'date_naissance': patient.date_naissance,
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
            'date_naissance': patient.date_naissance,
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
                patient.date_naissance = data.get('date_naissance')
            if 'sexe' in data:
                patient.sexe = data.get('sexe', '').strip()
            if 'telephone' in data:
                patient.telephone = data.get('telephone', '').strip()
            if 'adresse' in data:
                patient.adresse = data.get('adresse', '').strip()
            if 'groupe_sanguin' in data:
                patient.groupe_sanguin = data.get('groupe_sanguin', '').strip()
            if 'allergie' in data:
                patient.allergie = data.get('allergie', '').strip()
            
            patient.save()
            
            return JsonResponse({
                'id': patient.id,
                'nom': patient.nom,
                'prenom': patient.prenom,
                'date_naissance': patient.date_naissance,
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
    """Liste toutes les consultations ou crée une nouvelle"""
    from .models import Consultation, Patient
    
    if request.method == 'GET':
        consultations = Consultation.objects.all().select_related('patient', 'medecin')
        data = []
        for cons in consultations:
            data.append({
                'id': cons.id,
                'patient': cons.patient.id,
                'patient_nom': f"{cons.patient.nom} {cons.patient.prenom}",
                'medecin': cons.medecin.id,
                'medecin_nom': f"Dr. {cons.medecin.user.first_name} {cons.medecin.user.last_name}",
                'date': cons.date.isoformat(),
                'symptome': cons.symptome,
                'diagnostic': cons.diagnostic,
            })
        return JsonResponse(data, safe=False)
    
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            
            # Récupérer le patient et le médecin
            patient_name = data.get('patient', '').strip().split()
            medecin = Medecin.objects.filter(user=request.user).first()
            
            if not patient_name or not medecin:
                return JsonResponse({'error': 'Données invalides'}, status=400)
            
            # Trouver le patient par nom
            from django.db.models import Q
            patient = Patient.objects.filter(
                Q(nom=patient_name[0]) if len(patient_name) > 0 else Q(nom='')
            ).first()
            
            if not patient:
                return JsonResponse({'error': 'Patient non trouvé'}, status=404)
            
            consultation = Consultation.objects.create(
                patient=patient,
                medecin=medecin,
                symptome=data.get('symptome', '').strip(),
                diagnostic=data.get('diagnostic', '').strip(),
            )
            
            return JsonResponse({
                'id': consultation.id,
                'patient': patient.id,
                'patient_nom': f"{patient.nom} {patient.prenom}",
                'medecin': medecin.id,
                'medecin_nom': f"Dr. {medecin.user.first_name} {medecin.user.last_name}",
                'date': consultation.date.isoformat(),
                'symptome': consultation.symptome,
                'diagnostic': consultation.diagnostic,
            }, status=201)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

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
            'date': consultation.date.isoformat(),
            'symptome': consultation.symptome,
            'diagnostic': consultation.diagnostic,
        })
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            
            if 'symptome' in data:
                consultation.symptome = data.get('symptome', '').strip()
            if 'diagnostic' in data:
                consultation.diagnostic = data.get('diagnostic', '').strip()
            
            consultation.save()
            
            return JsonResponse({
                'id': consultation.id,
                'patient': consultation.patient.id,
                'patient_nom': f"{consultation.patient.nom} {consultation.patient.prenom}",
                'medecin': consultation.medecin.id,
                'medecin_nom': f"Dr. {consultation.medecin.user.first_name} {consultation.medecin.user.last_name}",
                'date': consultation.date.isoformat(),
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
    """Liste toutes les prescriptions ou crée une nouvelle"""
    from .models import Prescription, Consultation
    
    if request.method == 'GET':
        prescriptions = Prescription.objects.all().select_related('consultation', 'consultation__patient')
        data = []
        for pres in prescriptions:
            data.append({
                'id': pres.id,
                'consultation': pres.consultation.id,
                'consultation_date': pres.consultation.date.isoformat() if pres.consultation else None,
                'patient_nom': f"{pres.consultation.patient.nom} {pres.consultation.patient.prenom}" if pres.consultation else '-',
                'medications': pres.medicaments,
                'date': pres.consultation.date.isoformat() if pres.consultation else None,
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
            
            return JsonResponse({
                'id': prescription.id,
                'consultation': consultation.id,
                'consultation_date': consultation.date.isoformat(),
                'patient_nom': f"{consultation.patient.nom} {consultation.patient.prenom}",
                'medications': prescription.medicaments,
                'date': consultation.date.isoformat(),
                'notes': '',
            }, status=201)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

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
        return JsonResponse({
            'id': prescription.id,
            'consultation': prescription.consultation.id,
            'consultation_date': prescription.consultation.date.isoformat(),
            'patient_nom': f"{prescription.consultation.patient.nom} {prescription.consultation.patient.prenom}",
            'medications': prescription.medicaments,
            'date': prescription.consultation.date.isoformat(),
            'notes': '',
        })
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            
            if 'medications' in data:
                prescription.medicaments = data.get('medications', '').strip()
            
            prescription.save()
            
            return JsonResponse({
                'id': prescription.id,
                'consultation': prescription.consultation.id,
                'consultation_date': prescription.consultation.date.isoformat(),
                'patient_nom': f"{prescription.consultation.patient.nom} {prescription.consultation.patient.prenom}",
                'medications': prescription.medicaments,
                'date': prescription.consultation.date.isoformat(),
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
    """Liste tous les rendez-vous ou crée un nouveau"""
    from .models import RendezVous, Patient
    from django.utils import timezone
    
    if request.method == 'GET':
        date_filter = request.GET.get('date')
        rdvs = RendezVous.objects.all().select_related('patient', 'medecin')
        
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
                'heure': rdv.heure,
                'motif': getattr(rdv, 'motif', ''),
                'statut': getattr(rdv, 'statut', 'attente'),
            })
        return JsonResponse(data, safe=False)
    
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            
            patient_name = data.get('patient', '').strip().split()
            medecin = Medecin.objects.filter(user=request.user).first()
            
            if not patient_name or not medecin:
                return JsonResponse({'error': 'Données invalides'}, status=400)
            
            from django.db.models import Q
            patient = Patient.objects.filter(
                Q(nom=patient_name[0]) if len(patient_name) > 0 else Q(nom='')
            ).first()
            
            if not patient:
                return JsonResponse({'error': 'Patient non trouvé'}, status=404)
            
            # donné necessaire pour le teste de lheure de rendez-vous
            marge_time = timedelta(minutes=10)
            heure = datetime.strptime(data.get('heure', ''))
            heure_min = (heure - marge_time).time()
            heure_max = (heure + marge_time).time()
            
            #tester si un rendez vous est entre la date et lheure donne avec une marge de 2mn
            collusion = RendezVous.objects.filter(
                medecin = medecin,
                date = data.get('date'),
                heure__range = (heure_min, heure_max)
            ).exists()

            if not collusion:
                rdv = RendezVous.objects.create(
                    patient=patient,
                    medecin=medecin,
                    date=data.get('date'),
                    heure=data.get('heure', ''),
                    motif=data.get('motif', ''),
                    statut=data.get('statut', 'attente'),
                )
            else:
                return JsonResponse({ 'le medecin est deja occupe a cette heure'}, status= 400)
                #fin du changement de code    

            return JsonResponse({
                'id': rdv.id,
                'patient': patient.id,
                'patient_nom': f"{patient.nom} {patient.prenom}",
                'medecin': medecin.id,
                'medecin_nom': f"Dr. {medecin.user.first_name} {medecin.user.last_name}",
                'date': rdv.date.isoformat() if rdv.date else None,
                'heure': rdv.heure,
                'motif': rdv.motif,
                'statut': rdv.statut,
            }, status=201)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

@login_required(login_url='login_views')
@require_http_methods(["GET", "PUT", "DELETE"])
def rendezvous_detail_api(request, pk):
    """Récupère, modifie ou supprime un rendez-vous"""
    from .models import RendezVous
    
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
            'heure': rdv.heure,
            'motif': getattr(rdv, 'motif', ''),
            'statut': getattr(rdv, 'statut', 'attente'),
        })
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            
            if 'date' in data:
                rdv.date = data.get('date')
            if 'heure' in data:
                rdv.heure = data.get('heure', '')
            if 'motif' in data:
                rdv.motif = data.get('motif', '')
            if 'statut' in data:
                rdv.statut = data.get('statut', 'attente')
            
            rdv.save()
            
            return JsonResponse({
                'id': rdv.id,
                'patient': rdv.patient.id,
                'patient_nom': f"{rdv.patient.nom} {rdv.patient.prenom}",
                'medecin': rdv.medecin.id,
                'medecin_nom': f"Dr. {rdv.medecin.user.first_name} {rdv.medecin.user.last_name}",
                'date': rdv.date.isoformat() if rdv.date else None,
                'heure': rdv.heure,
                'motif': rdv.motif,
                'statut': rdv.statut,
            })
        except json.JSONDecodeError:
            return JsonResponse({'error': 'JSON invalide'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    
    elif request.method == 'DELETE':
        rdv.delete()
        return JsonResponse({'message': 'Rendez-vous supprimé'}, status=204)
