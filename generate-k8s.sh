#!/usr/bin/env bash
# Run from the repo root (Deploy_MicroServices_EKS-GitOps). Safe to re-run: it overwrites the generated files.
set -euo pipefail

ECR="113903681860.dkr.ecr.ap-south-1.amazonaws.com/taskmanager"

mkdir -p k8s/base k8s/overlays/dev k8s/cluster-setup argocd

# ---------- namespace ----------
cat > k8s/base/namespace.yaml <<'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: taskmanager
EOF

# ---------- configmap (non-secret settings; service names match docker-compose) ----------
cat > k8s/base/configmap.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  MONGO_URI: mongodb://mongo:27017/task_manager
  NOTIFICATION_SERVICE_URL: http://notification-service:4005
  AUTH_SERVICE_URL: http://auth-service:4002
  USER_SERVICE_URL: http://user-service:4003
  TASK_SERVICE_URL: http://task-service:4004
EOF

# ---------- mongo ----------
cat > k8s/base/mongo.yaml <<'EOF'
# NOTE: emptyDir means data is lost if the pod is rescheduled. Fine for practice.
# Later: swap for a PVC (needs a StorageClass) or use a managed DB.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mongo
  labels:
    app: mongo
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: mongo
  template:
    metadata:
      labels:
        app: mongo
    spec:
      containers:
        - name: mongo
          image: mongo:7
          args: ["--wiredTigerCacheSizeGB", "0.25"]
          ports:
            - containerPort: 27017
          readinessProbe:
            tcpSocket:
              port: 27017
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            tcpSocket:
              port: 27017
            initialDelaySeconds: 30
            periodSeconds: 20
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              memory: 512Mi
          volumeMounts:
            - name: data
              mountPath: /data/db
      volumes:
        - name: data
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: mongo
spec:
  selector:
    app: mongo
  ports:
    - port: 27017
      targetPort: 27017
EOF

# ---------- node services ----------
JWT_ENV="$(cat <<'X'
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: JWT_SECRET
X
)"

gen_service() {
  local name=$1 port=$2 extra=${3:-}
  cat > "k8s/base/${name}.yaml" <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  labels:
    app: ${name}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
    spec:
      containers:
        - name: ${name}
          image: ${name}
          ports:
            - containerPort: ${port}
          envFrom:
            - configMapRef:
                name: app-config
          env:
            - name: PORT
              value: "${port}"
${extra}
          readinessProbe:
            httpGet:
              path: /health
              port: ${port}
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: ${port}
            initialDelaySeconds: 20
            periodSeconds: 20
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              memory: 256Mi
---
apiVersion: v1
kind: Service
metadata:
  name: ${name}
spec:
  selector:
    app: ${name}
  ports:
    - port: ${port}
      targetPort: ${port}
EOF
}

gen_service notification-service 4005
gen_service auth-service 4002 "$JWT_ENV"
gen_service user-service 4003
gen_service task-service 4004
gen_service api-gateway 4000 "$JWT_ENV"

# ---------- frontend ----------
cat > k8s/base/frontend.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  labels:
    app: frontend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: frontend
          image: frontend
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 3
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 10
            periodSeconds: 20
          resources:
            requests:
              cpu: 20m
              memory: 32Mi
            limits:
              memory: 128Mi
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
spec:
  selector:
    app: frontend
  ports:
    - port: 80
      targetPort: 80
EOF

# ---------- ingress (only frontend is exposed; it is expected to proxy /api to api-gateway) ----------
cat > k8s/base/ingress.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: task-manager
  annotations:
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/healthcheck-path: /
spec:
  ingressClassName: alb
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
EOF

# ---------- base kustomization ----------
cat > k8s/base/kustomization.yaml <<'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: taskmanager
resources:
  - namespace.yaml
  - configmap.yaml
  - mongo.yaml
  - notification-service.yaml
  - auth-service.yaml
  - user-service.yaml
  - task-service.yaml
  - api-gateway.yaml
  - frontend.yaml
  - ingress.yaml
EOF

# ---------- dev overlay: maps short image names to ECR + tag (CI bumps newTag) ----------
{
cat <<'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
images:
EOF
for n in api-gateway auth-service user-service task-service notification-service frontend; do
cat <<EOF
  - name: ${n}
    newName: ${ECR}/${n}
    newTag: v1
EOF
done
} > k8s/overlays/dev/kustomization.yaml

# ---------- one-time cluster setup (NOT managed by ArgoCD; apply by hand) ----------
cat > k8s/cluster-setup/ingressclass-alb.yaml <<'EOF'
# Only for EKS Auto Mode. Apply once: kubectl apply -f k8s/cluster-setup/ingressclass-alb.yaml
apiVersion: eks.amazonaws.com/v1
kind: IngressClassParams
metadata:
  name: alb
spec:
  scheme: internet-facing
---
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: alb
  annotations:
    ingressclass.kubernetes.io/is-default-class: "true"
spec:
  controller: eks.amazonaws.com/alb
  parameters:
    apiGroup: eks.amazonaws.com
    kind: IngressClassParams
    name: alb
EOF

# ---------- ArgoCD application ----------
cat > argocd/application.yaml <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: task-manager
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/https://github.com/NikhilBCA2022/Deploy_MicroServices_EKS-GitOps/Deploy_MicroServices_EKS-GitOps.git
    targetRevision: master
    path: k8s/overlays/dev
  destination:
    server: https://kubernetes.default.svc
    namespace: taskmanager
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
EOF

echo "Done. Generated:"
find k8s argocd -type f | sort
