{{/*
Expand the name of the chart.
*/}}
{{- define "deployment-platform.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "deployment-platform.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Chart name and version label.
*/}}
{{- define "deployment-platform.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels.
*/}}
{{- define "deployment-platform.labels" -}}
helm.sh/chart: {{ include "deployment-platform.chart" . }}
{{ include "deployment-platform.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.app.version | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: deployment-platform
{{- end -}}

{{/*
Selector labels (without a fixed component).
*/}}
{{- define "deployment-platform.selectorLabels" -}}
app.kubernetes.io/name: {{ include "deployment-platform.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
ServiceAccount name.
*/}}
{{- define "deployment-platform.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "deployment-platform.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
Postgres host.
*/}}
{{- define "deployment-platform.postgresHost" -}}
{{- if .Values.config.postgres.host -}}
{{- .Values.config.postgres.host -}}
{{- else if .Values.postgresql.enabled -}}
{{- printf "%s-postgresql" (include "deployment-platform.fullname" .) -}}
{{- else -}}
{{- "postgres" -}}
{{- end -}}
{{- end -}}

{{/*
Redis host.
*/}}
{{- define "deployment-platform.redisHost" -}}
{{- if .Values.config.redis.host -}}
{{- .Values.config.redis.host -}}
{{- else if .Values.redis.enabled -}}
{{- printf "%s-redis" (include "deployment-platform.fullname" .) -}}
{{- else -}}
{{- "redis" -}}
{{- end -}}
{{- end -}}

{{/*
Postgres secret name. When the in-chart postgres is enabled we create a
Secret in a Secret template named <fullname>-postgresql; otherwise the
user must supply one and we use <fullname>.
*/}}
{{- define "deployment-platform.postgresSecretName" -}}
{{- if and .Values.postgresql.enabled (not .Values.postgresql.existingSecret) -}}
{{- printf "%s-postgresql" (include "deployment-platform.fullname" .) -}}
{{- else if .Values.postgresql.existingSecret -}}
{{- .Values.postgresql.existingSecret -}}
{{- else -}}
{{- include "deployment-platform.fullname" . -}}
{{- end -}}
{{- end -}}
