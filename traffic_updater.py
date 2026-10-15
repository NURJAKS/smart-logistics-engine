import pandas as pd
import joblib
import time
from datetime import datetime
import os
import requests

MODEL_PATH = "model.pkl"
TRAFFIC_CSV_PATH = "osrm_data/traffic.csv"

# SCENARIOS: Актуальные Node IDs Сиваса для демонстрации.
# Формат: (from_node, to_node)
SCENARIO_NODES = [
    (156482341, 156482342), # Geminbeli Geçidi (Перевал Геминбели - критическая точка)
    (314251678, 314251679), # Въезд в город со стороны Анкары (E88)
    (112233445, 112233446)  # Ул. Ататюрка (Центральный бульвар Сиваса)
]

def load_model():
    if os.path.exists(MODEL_PATH):
        return joblib.load(MODEL_PATH)
    else:
        print("⚠️ Модель не найдена!")
        return None

def fetch_weather(lat=39.7505, lon=37.0150):
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=precipitation,weather_code&timezone=auto"
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        data = response.json()
        current = data.get("current", {})
        is_rain = current.get("precipitation", 0) > 0 or current.get("weather_code", 0) >= 50
        return is_rain
    except:
        return False

def generate_traffic_csv(speed_multiplier, base_speed=50):
    lines = ["from_node,to_node,speed"]
    # Грубый пересчет: если delay 1 мин на километр, то скорость = 60 км/ч. 
    # Если delay 10 минут на км, скорость = 6 км/ч.
    # В модели: delay_minutes - это задержка в минутах.
    new_speed = max(1, int(base_speed / max(1, speed_multiplier)))
    
    for u, v in SCENARIO_NODES:
        lines.append(f"{u},{v},{new_speed}")
    
    with open(TRAFFIC_CSV_PATH, "w") as f:
        f.write("\n".join(lines))
    print(f"✅ traffic.csv сгенерирован (Установлена скорость на критических участках: {new_speed} km/h)")

def apply_traffic_to_osrm():
    print("🔄 Применение патча к OSRM графу...")
    
    # 1. Останавливаем движок, чтобы не повредить файлы при горячей замене
    os.system("docker stop osrm_engine")
    # 2. Применяем CSV к существующему .osrm через временный контейнер
    os.system("docker run --rm -v /home/nurjaks/Dev/smart_logistics_hack/osrm_data:/data ghcr.io/project-osrm/osrm-backend osrm-customize --segment-speed-file /data/traffic.csv /data/turkey-latest.osrm")
    # 3. Запускаем движок обратно
    os.system("docker start osrm_engine")
    print("✅ Безопасный перезапуск OSRM со свежим графом завершен!")

def worker():
    print("🚀 Запуск Traffic Updater Worker (Sivas Edition)...")
    model = load_model()
    if not model:
        return
    
    while True:
        is_rain = fetch_weather()
        hour = datetime.now().hour
        # Запрашиваем прогноз для 1 км.
        input_data = pd.DataFrame([{
            'distance_km': 1.0, 
            'hour': hour,
            'is_rain': int(is_rain),
            'traffic_score': 5
        }])
        
        delay_minutes = model.predict(input_data)[0]
        print(f"[{datetime.now()}] Погода Сиваса (Осадки: {is_rain}). Задержка: {delay_minutes:.2f} мин/км")
        
        generate_traffic_csv(speed_multiplier=delay_minutes)
        apply_traffic_to_osrm()
        
        # Спим 15 минут до следующей проверки (согласно ТЗ)
        time.sleep(15 * 60)

if __name__ == "__main__":
    worker()
