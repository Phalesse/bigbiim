provider "kubernetes" {
  config_path = var.kubeconfig_path
}

# Namespaces : dev, staging, prod, plus platform (outils).
locals {
  namespaces = ["dev", "staging", "prod", "platform"]
}

resource "kubernetes_namespace" "ns" {
  for_each = toset(local.namespaces)
  metadata {
    name = each.key
    labels = {
      "app.kubernetes.io/part-of" = "bigbiim"
    }
  }
}

# À ajouter selon votre hébergeur : cluster (k3s sur 3 serveurs ou Kubernetes managé), stockage externe des sauvegardes,
# opérateur CloudNativePG, Argo CD, cert-manager, External Secrets, Velero.
