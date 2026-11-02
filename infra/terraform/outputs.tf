output "namespaces" {
  value = [for n in kubernetes_namespace.ns : n.metadata[0].name]
}
