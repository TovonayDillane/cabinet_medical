from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from .models import Medecin, Secretaire
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache

# Create your views here.

def login_views(request):
    if request.method == 'POST':
        username = request.POST.get('username') 
        mdp = request.POST.get("password")
        if username:
            user = authenticate(request, username=username, password=mdp)  # ✅ username au lieu de email
            if user is not None:
                login(request, user)
                if hasattr(user, 'profil_medecin'):
                    return redirect('dashboard_med')
                elif hasattr(user, 'profil_secretaire'):
                    return redirect('dashboard_secre')
                else:
                    return redirect('/admin')
            else:
                messages.error(request, "Mot de passe incorrect ou utilisateur invalide")
    return render(request, 'api/login.html')

@login_required(login_url='login_views')
@never_cache
def dashboard_med(request):
    return render(request, 'api/dashboard_med.html')

@login_required(login_url='login_views')
@never_cache
def dashboard_secre(request):
    return render(request, 'api/dashboard_secre.html')

@login_required(login_url='login_views')
@never_cache
def logout_view(request):
    logout(request) 
    return redirect('login_views')