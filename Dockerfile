# Static image for self-hosting Reps on a cluster you already run.
#   docker build -t harbor.internal/platform/reps:1 .
#   docker push  harbor.internal/platform/reps:1
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html sw.js /usr/share/nginx/html/
COPY app/     /usr/share/nginx/html/app/
COPY content/ /usr/share/nginx/html/content/

EXPOSE 8080
