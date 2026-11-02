{{- define "bigbiim.fullname" -}}
{{- .Release.Name | trunc 40 | trimSuffix "-" -}}
{{- end -}}

{{- define "bigbiim.selectorLabels" -}}
app.kubernetes.io/name: bigbiim
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "bigbiim.labels" -}}
{{ include "bigbiim.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}
