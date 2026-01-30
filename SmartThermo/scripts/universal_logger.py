import os
import time
import random
import json
import sys 
from datetime import datetime
import requests
import math
from dotenv import load_dotenv

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# Konfiguracja
load_dotenv()
OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY")

# Parametry
CITY = os.environ.get("CITY", "Kraków")
USE_SENSOR = os.environ.get("USE_SENSOR", "0") == "1"
INTERVAL = int(os.environ.get("INTERVAL", "180"))

# Konfiguracja ścieżek
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE = os.path.join(SCRIPT_DIR, "../jsons/cache.json")

# URL do API Node.js
API_URL = "http://localhost:8888/api/weather/update"

# Globalne zmienne
data = {}
temperature = 0
humidity = 0
pressure = 0
wind = "0 km/h"
temp_o = 0

def readSensor():
    global temperature, humidity, pressure
    if USE_SENSOR:
        try:
            from sense_hat import SenseHat
            sense = SenseHat()
            temperature = sense.get_temperature() - 16.5
            humidity = sense.get_humidity()
            pressure = sense.get_pressure()
            
            if pressure < 500: 
                 pressure += 1000 
            
            humidity = round(humidity, 1)
            pressure = round(pressure, 1)
            temperature = round(temperature, 1)
        except Exception as e:
            print("Błąd Sense HAT:", e)
            temperature = 20
            humidity = 50
            pressure = 1013
    else:
        # Symulacja
        temperature = round(random.uniform(20, 22), 1)
        humidity = round(random.uniform(30, 60), 1)
        pressure = round(random.uniform(1000, 1030), 1)

def read_data_weather():
    global wind, temp_o
    try:
        url = f'https://api.openweathermap.org/data/2.5/weather?q={CITY},pl&appid={OPENWEATHER_API_KEY}'
        res = requests.get(url, timeout=5)
        filedata = res.json()
        
        if res.status_code == 200:
            speed = math.ceil(filedata['wind']['speed'] * 3.6)
            wind = f'{speed} km/h'
            temp_o = math.ceil(round(filedata['main']['temp'] - 273.15, 2))
        else:
            print("Błąd OpenWeather:", filedata.get("message", "Unknown"))
    except Exception as e:
        print("Błąd pobierania pogody z netu:", e)

def save_to_cache(payload):
    """Zapisuje nieudane wysłanie do pliku JSON"""
    cache_data = []
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                content = f.read()
                if content:
                    cache_data = json.loads(content)
        except Exception as e:
            print("⚠️ Błąd odczytu cache:", e)
            cache_data = []

    cache_data.append(payload)

    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, 'w') as f:
            json.dump(cache_data, f, indent=4)
        print(f"💾 Zapisano dane offline do: {CACHE_FILE} (Liczba wpisów: {len(cache_data)})")
    except Exception as e:
        print("❌ Krytyczny błąd zapisu cache:", e)

def flush_cache():
    """Próbuje wysłać zaległe dane z pliku"""
    if not os.path.exists(CACHE_FILE):
        return

    try:
        with open(CACHE_FILE, 'r') as f:
            content = f.read()
            if not content: return
            cache_data = json.loads(content)
    except:
        return

    if not cache_data:
        return

    print(f"📡 Wykryto {len(cache_data)} zaległych wpisów w cache. Wysyłanie...")
    
    remaining_data = []
    sent_count = 0

    for item in cache_data:
        try:
            res = requests.post(API_URL, json=item, timeout=2)
            if res.status_code == 200:
                sent_count += 1
            else:
                remaining_data.append(item)
        except:
            remaining_data.append(item)

    if len(remaining_data) == 0:
        os.remove(CACHE_FILE)
        print("✅ Cały cache wysłany i wyczyszczony!")
    else:
        with open(CACHE_FILE, 'w') as f:
            json.dump(remaining_data, f, indent=4)
        print(f"⚠️ Wysłano {sent_count}, pozostało {len(remaining_data)} w cache.")

def sendDataToServer():
    global data
    dt = datetime.now().strftime('%F %T')
    readSensor()
    read_data_weather()
    
    data = {
        "city": CITY,
        "temp_ins": temperature,
        "hum_ins": humidity,
        "pressure": pressure,
        "temp_out": temp_o,
        "wind": wind,
        "due_date": dt
    }
    
    try:
        response = requests.post(API_URL, json=data, timeout=5)
        if response.status_code == 200:
            print(f"\n✅ API OK: {temperature}°C / {temp_o}°C")
            flush_cache()
        else:
            print(f"⚠️ API Error {response.status_code} - zapisuję do cache.")
            save_to_cache(data)
    except Exception as e:
        print(f"\n❌ Błąd połączenia z API ({e}) - zapisuję do cache.")
        save_to_cache(data)

if __name__ == "__main__":
    print(f"🚀 Logger Start. Miasto: {CITY}")
    print(f"📁 Cache file: {CACHE_FILE}")
    print(f"⏱️  Interwał: {INTERVAL}s")
    print("⌨️  Ctrl+C aby zatrzymać.\n")

    try:
        while True:
            sendDataToServer()
            time.sleep(INTERVAL)
    except KeyboardInterrupt:
        print("\n👋 Zatrzymano.")
        exit(0)