{{/*
Chart name, truncated/cleaned for use in resource names.
*/}}
{{- define "ifric-registry-service.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Fully qualified app name — includes the release name unless the release
name already contains the chart name.
*/}}
{{- define "ifric-registry-service.fullname" -}}
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
Common labels applied to every resource.
*/}}
{{- define "ifric-registry-service.labels" -}}
helm.sh/chart: {{ printf "%s-%s" (include "ifric-registry-service.name" .) .Chart.Version | replace "+" "_" }}
{{ include "ifric-registry-service.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Base selector labels — component-specific templates append
app.kubernetes.io/component themselves so Postgres/ICID/Mongo/backend pods
never collide under the same selector.
*/}}
{{- define "ifric-registry-service.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ifric-registry-service.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Name of the Secret holding JWT_SECRET / HEDERA_KEY_SECRET / DB_PASSWORD —
either a user-supplied existing Secret, or the one this chart creates.
*/}}
{{- define "ifric-registry-service.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-secret" (include "ifric-registry-service.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/*
In-cluster Postgres Service host (matches the postgres StatefulSet's
Service name — see templates/postgres/service.yaml).
*/}}
{{- define "ifric-registry-service.postgresHost" -}}
{{- printf "%s-postgres" (include "ifric-registry-service.fullname" .) -}}
{{- end -}}

{{/*
In-cluster ICID Service host (matches templates/icid/service.yaml) — only
meaningful when .Values.icid.enabled is true.
*/}}
{{- define "ifric-registry-service.icidHost" -}}
{{- printf "%s-icid" (include "ifric-registry-service.fullname" .) -}}
{{- end -}}

{{/*
In-cluster ICID MongoDB Service host (matches
templates/icid/mongodb-service.yaml) — only meaningful when
.Values.icid.enabled is true.
*/}}
{{- define "ifric-registry-service.icidMongoHost" -}}
{{- printf "%s-icid-mongodb" (include "ifric-registry-service.fullname" .) -}}
{{- end -}}

{{/*
In-cluster Keycloak Service host (matches templates/keycloak/service.yaml)
— only meaningful when .Values.keycloak.enabled is true.
*/}}
{{- define "ifric-registry-service.keycloakHost" -}}
{{- printf "%s-keycloak" (include "ifric-registry-service.fullname" .) -}}
{{- end -}}
