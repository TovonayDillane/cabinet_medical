from django.db import models
from django.contrib.auth.models import User

# Create your models here.
class Medecin(models.Model):
    SPECIALISTE_CHOICES = [
        ('GINECO', 'Gynécologue'),
        ('TRAITANT', 'Médecin traitant'),
        ('DENTISTE', 'Dentiste'),
        ('PEDIATRE', 'Pédiatre'),
        ('CARDIOLOGUE', 'Cardiologue'),
    ]
    STATUE_CHOICES = [
        ('DISPONIBLE', 'Disponible'),
        ('OCCUPE', 'Occupé'),
    ]
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profil_medecin')
    specialite = models.CharField(max_length=100, choices=SPECIALISTE_CHOICES, default='TRAITANT')
    statue = models.CharField(max_length=10, default='DISPONIBLE', choices=STATUE_CHOICES)
    
    def __str__(self):
        return f'Dr {self.user.last_name}'
    
class Secretaire(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profil_secretaire')

    def __str__(self):
        return f'Secrétaire {self.user.last_name}'
    
class Patient(models.Model):
    SEXE_CHOICES = [
        ('H', 'Homme'),
        ('F', 'Femme'),
    ]
    GROUPE_SANGUIN_CHOICES = [
        ('A', 'A'),
        ('B', 'B'),
        ('O', 'O'),
        ('AB', 'AB'),
    ]
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    date_naissance = models.DateField()
    sexe = models.CharField(max_length=5, choices=SEXE_CHOICES)
    telephone = models.CharField(max_length=14)
    adresse = models.TextField()
    groupe_sanguin = models.CharField(max_length=4, choices=GROUPE_SANGUIN_CHOICES)
    allergie = models.TextField(blank=True)

    def __str__(self):
        return f'{self.nom} {self.prenom}'
    
class RendezVous(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE)
    medecin = models.ForeignKey(Medecin, on_delete=models.CASCADE)
    date = models.DateField()
    heure = models.TimeField()
    statut = models.CharField(max_length=11, default='attente')

class Consultation(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE)
    medecin = models.ForeignKey(Medecin, on_delete=models.CASCADE)
    date = models.DateField(auto_now_add=True)
    symptome = models.TextField()
    diagnostic = models.TextField()

class Prescription(models.Model):
    consultation = models.ForeignKey(Consultation, on_delete=models.CASCADE)
    medicaments = models.TextField()
    