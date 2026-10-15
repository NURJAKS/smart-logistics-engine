#!/bin/bash
set -e

echo "🌟 Остановка контейнеров (если запущены)..."
docker compose down

echo "🌟 Шаг 1/3: osrm-extract (Извлечение дорожной сети / Модель: CAR)"
docker run -t -v $(pwd)/osrm_data:/data ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/turkey-latest.osm.pbf

echo "🌟 Шаг 2/3: osrm-partition (Разбиение графа для MLD алгоритма)"
docker run -t -v $(pwd)/osrm_data:/data ghcr.io/project-osrm/osrm-backend osrm-partition /data/turkey-latest.osrm

echo "🌟 Шаг 3/3: osrm-customize (Вычисление базовых весов и времени в пути)"
docker run -t -v $(pwd)/osrm_data:/data ghcr.io/project-osrm/osrm-backend osrm-customize /data/turkey-latest.osrm

echo "✅ Подготовка OSRM завершена. Теперь можно запускать: docker compose up -d"
