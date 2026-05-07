# Self-host midee on ZimaOS

This fork adds a Docker package for serving midee as a static web app. The image is built by GitHub Actions and published to GitHub Container Registry.

## Build and run

On the ZimaOS host, use the included `docker-compose.yml` or paste this compose content into the ZimaOS compose editor:

```yaml
name: midee

services:
  midee:
    image: ghcr.io/kaanaldemir/midee-selfhost:latest
    container_name: midee
    restart: unless-stopped
    ports:
      - "8088:80"
```

The app is then available at:

```text
http://<zimaos-ip>:8088
```

## HTTPS requirement for MIDI devices

The browser Web MIDI API requires a secure context. Computer-keyboard playback works over plain HTTP, but USB MIDI controllers should be used through HTTPS.

Recommended setup:

1. Point a domain or subdomain at the ZimaOS device.
2. Put this container behind your existing reverse proxy.
3. Enable TLS for the public hostname.
4. Proxy the hostname to `http://midee:80` if the proxy is in the same Docker network, or to `http://<zimaos-ip>:8088` otherwise.

## Updating

Pull the latest GitHub-built image:

```sh
docker compose pull
docker compose up -d
```

For local development only, build from source with:

```sh
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## Notes

- The container serves the built static files with Nginx.
- GitHub Actions builds the image from `Dockerfile` and publishes `ghcr.io/kaanaldemir/midee-selfhost:latest`.
- The Docker build uses `npm run build:selfhost`, which skips the upstream PostHog source-map upload step.
- The default compose file publishes port `8088`; change it if that port is already used.
