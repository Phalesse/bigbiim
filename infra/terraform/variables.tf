variable "kubeconfig_path" {
  description = "Chemin du fichier kubeconfig du cluster (k3s ou Kubernetes managé)"
  type        = string
  default     = "~/.kube/config"
}
