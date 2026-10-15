#!/bin/bash
set -e

echo "🚀 Запуск процесса развертывания Smart Fleet 4D (Sivas Edition)..."

# 1. Проверка Docker
if ! [ -x "$(command -v docker)" ]; then
  echo "❌ Ошибка: Docker не установлен." >&2
  exit 1
fi

# 2. Подготовка папок
mkdir -p osrm_data

# 3. Настройка .env
if [ ! -f .env ]; then
  echo "⚠️ Файл .env не найден. Создаю шаблон..."
  echo "GEMINI_API_KEY=YOUR_KEY_HERE" > .env
  echo "Пожалуйста, впишите ваш API ключ в .env и запустите скрипт снова."
  exit 1
fi

# 4. Сборка OSRM (если данных еще нет)
if [ ! -f osrm_data/turkey-latest.osrm ]; then
  echo "📦 Данные OSRM не обнаружены. Запускаю сборку (может занять время)..."
  chmod +x setup_osrm.sh
  ./setup_osrm.sh
fi

# 5. Запуск всех контейнеров
echo "🐳 Сборка и запуск Docker-контейнеров..."
docker compose build
docker compose up -d

echo "✅ Система развернута!"
echo "📍 Dashboard: http://localhost"
echo "📍 API Health: http://localhost:18000/health"
echo "📍 OSRM Status: http://localhost:5000"
