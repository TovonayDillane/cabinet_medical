from django.urls import path, re_path
from . import views

urlpatterns = [ 
    path('', views.login_views, name="login_views"),
    path('dashboard_med/', views.dashboard_med, name="dashboard_med"),
    path('dashboard_secre/', views.dashboard_secre, name="dashboard_secre"),
    path('logout/', views.logout_view, name="logout"),
    
    # API
    path('api/dashboard/secretaire/', views.dashboard_secretaire_api, name='dashboard_secretaire_api'),
    path('api/dashboard/medecin/', views.dashboard_medecin_api, name='dashboard_medecin_api'),
    path('api/user/', views.user_profile_api, name='user_profile_api'),
    
    # API Médecins
    path('api/medecins/', views.medecins_list_api, name='medecins_list_api'),
    re_path(r'^api/medecins/(?P<pk>\d+)/$', views.medecin_detail_api, name='medecin_detail_api'),
    
    # API Patients
    path('api/patients/', views.patients_list_api, name='patients_list_api'),
    re_path(r'^api/patients/(?P<pk>\d+)/$', views.patient_detail_api, name='patient_detail_api'),
    
    # API Consultations
    path('api/consultations/', views.consultations_list_api, name='consultations_list_api'),
    re_path(r'^api/consultations/(?P<pk>\d+)/$', views.consultation_detail_api, name='consultation_detail_api'),
    
    # API Prescriptions
    path('api/prescriptions/', views.prescriptions_list_api, name='prescriptions_list_api'),
    re_path(r'^api/prescriptions/(?P<pk>\d+)/$', views.prescription_detail_api, name='prescription_detail_api'),
    
    # API Rendez-vous
    path('api/rendezvous/', views.rendezvous_list_api, name='rendezvous_list_api'),
    re_path(r'^api/rendezvous/(?P<pk>\d+)/$', views.rendezvous_detail_api, name='rendezvous_detail_api'),
]