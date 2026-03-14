from django.urls import path
from . import views

urlpatterns = [ 
    path('', views.login_views, name="login_views"),
    path('dashboard_med/', views.dashboard_med, name="dashboard_med"),
    path('dashboard_secre/', views.dashboard_secre, name="dashboard_secre"),
    path('logout/', views.logout_view, name="logout"),
]