service_name: rocketchat
docker_image: rocketchat/rocket.chat
docker_registry: docker.io
docker_compose_template: default
entrypoint:
  - "/rocketchat_env.sh"
  - "/usr/local/bin/node"
  - "/app/bundle/main.js"
volumes:
  - rocketchat-uploads:/app/uploads
volume_definitions:
  rocketchat-uploads:
environment:
  PORT: 3000
  ROOT_URL: https://chat.1day.io

environments:
  prod:
    docker_tag: "0.70.0"
    secrets:
      - source: "rocketchat_env_sh"
        target: "/rocketchat_env.sh"
        mode: "0555"
    deploy:
      resources:
        reservations:
          cpus: '0.5'
          memory: 800M
      update_config:
        delay: 30s
        order: start-first
      labels:
        - "traefik.docker.network=app_net"
        - "traefik.port=3000"
        - "traefik.frontend.rule=Host:chat.1day.io,update247.1day.io"