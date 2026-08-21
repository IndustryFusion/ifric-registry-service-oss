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
Name of the Secret holding the credentials that operate Keycloak itself —
KEYCLOAK_ADMIN_PASSWORD (the console admin the bundled Deployment creates)
and KEYCLOAK_BOOTSTRAP_CLIENT_SECRET (the service account the bootstrap Job
authenticates as). Deliberately NOT the app Secret above: the backend
mounts that one wholesale with envFrom, so anything left in it ends up in
the environment of the internet-facing application process. The backend
needs neither of these and must never carry them.
*/}}
{{- define "ifric-registry-service.keycloakOperatorSecretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-keycloak-operator" (include "ifric-registry-service.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/*
In-cluster Postgres Service host (matches the postgres StatefulSet's
Service name — see templates/postgres/service.yaml). Only meaningful when
.Values.postgres.enabled is true — use postgresHostResolved/
postgresPortResolved below for the host/port the app should actually use.
*/}}
{{- define "ifric-registry-service.postgresHost" -}}
{{- printf "%s-postgres" (include "ifric-registry-service.fullname" .) -}}
{{- end -}}

{{/*
Resolved Postgres host: the bundled in-cluster StatefulSet's Service when
postgres.enabled=true (default), else postgres.external.host. Every
template that needs to reach Postgres (configmap, backend/keycloak
wait-for-postgres initContainers, keycloak's KC_DB_URL) should use this
instead of postgresHost directly, so bundled and external both work.
*/}}
{{- define "ifric-registry-service.postgresHostResolved" -}}
{{- if .Values.postgres.enabled -}}
{{- include "ifric-registry-service.postgresHost" . -}}
{{- else -}}
{{- required "postgres.external.host is required when postgres.enabled=false — point it at a real PostgreSQL instance, or set postgres.enabled=true to bundle one" .Values.postgres.external.host -}}
{{- end -}}
{{- end -}}

{{/*
Resolved Postgres port — see postgresHostResolved.
*/}}
{{- define "ifric-registry-service.postgresPortResolved" -}}
{{- if .Values.postgres.enabled -}}
{{- .Values.postgres.service.port -}}
{{- else -}}
{{- .Values.postgres.external.port -}}
{{- end -}}
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
StatefulSet names — capped at 52, not the usual 63. The StatefulSet
controller stamps every pod it creates with a controller-revision-hash
label of "<statefulset-name>-<10-char-hash>", and a label VALUE over 63
characters is rejected. The StatefulSet object itself is created fine, so
this failure mode is invisible in `kubectl get sts` — it surfaces only as
a FailedCreate event ("Pod ... is invalid: metadata.labels: Invalid
value") and a pod that never appears at all. 52 + 1 + 10 = 63 exactly.
Only StatefulSets need this; Deployments name their pods differently.
These are names, not hostnames — nothing resolves them, so truncating is
safe (Services are named via the *Host helpers above, which the workloads
actually reference).
*/}}
{{- define "ifric-registry-service.icidMongoStsName" -}}
{{- printf "%s-icid-mongodb" (include "ifric-registry-service.fullname" .) | trunc 52 | trimSuffix "-" -}}
{{- end -}}

{{- define "ifric-registry-service.postgresStsName" -}}
{{- printf "%s-postgres" (include "ifric-registry-service.fullname" .) | trunc 52 | trimSuffix "-" -}}
{{- end -}}

{{/*
In-cluster Keycloak Service host (matches templates/keycloak/service.yaml)
— only meaningful when .Values.keycloak.enabled is true.
*/}}
{{- define "ifric-registry-service.keycloakHost" -}}
{{- printf "%s-keycloak" (include "ifric-registry-service.fullname" .) -}}
{{- end -}}
