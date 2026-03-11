from django.shortcuts import render, redirect

# Create your views here.
def acceuil(request):
    return render(request, 'api/acceuil.html')

def login(request):
    return render(request, 'api/login.html')