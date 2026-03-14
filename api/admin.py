from django.contrib import admin
from .models import Medecin, Secretaire, Patient, RendezVous, Consultation, Prescription

# Register your models here.
admin.site.register(Medecin)
admin.site.register(Secretaire)
admin.site.register(Patient)
admin.site.register(RendezVous)
admin.site.register(Consultation)
admin.site.register(Prescription)
