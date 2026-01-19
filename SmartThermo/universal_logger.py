import os
import time  # <--- ZMIANA: Importujemy time zamiast threading
import random
from datetime import datetime
import requests
import math
from pymongo import MongoClient
from dotenv import load_dotenv

# Konfiguracja
load_dotenv()
MONGO_URL = os.environ.get("MONGO_URL")
OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY")

# Parametry
CITY = os.environ.get("CITY", "Kraków")
USE_SENSOR = os.environ.get("USE_SENSOR", "0") == "1"
INTERVAL = int(os.environ.get("INTERVAL", "180"))
DB_NAME = os.environ.get("DB_NAME", "smartthermodatabase")
COLLECTION_NAME = os.environ.get("COLLECTION_NAME", "weatherdata")

# Globalne zmienne na dane
data = {}
temperature = 0
humidity = 0
pressure = 0
wind = "0 km/h"
temp_o = 0
city = CITY

def get_database():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]
    return collection

def readSensor():
    global temperature, humidity, pressure
    if USE_SENSOR:
        try:
            from sense_hat import SenseHat
            sense = SenseHat()
            temperature = sense.get_temperature() - 16.5
            humidity = sense.get_humidity()
            pressure = sense.get_pressure()
            
            # Kalibracja ciśnienia (jeśli sense hat zwraca dziwne wartości)
            if pressure < 500: # Czasem zwraca 0 lub błędy
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
        # Symulacja danych
        temperature = round(random.uniform(18, 25), 1)
        humidity = round(random.uniform(30, 60), 1)
        pressure = round(random.uniform(1000, 1030), 1)

def read_data_weather():
    global wind, temp_o, city
    try:
        url = f'https://api.openweathermap.org/data/2.5/weather?q={CITY},pl&appid={OPENWEATHER_API_KEY}'
        res = requests.get(url)
        filedata = res.json()
        
        if res.status_code == 200:
            speed = math.ceil(filedata['wind']['speed'] * 3.6)
            wind = f'{speed} km/h'
            temp_o = math.ceil(round(filedata['main']['temp'] - 273.15, 2))
        else:
            print("Błąd OpenWeather:", filedata.get("message", "Unknown error"))
    except Exception as e:
        print("Błąd pobierania pogody:", e)

def sendDataToServer():
    global data
    
    # 1. Pobierz dane
    dt = datetime.now().strftime('%F %T')
    readSensor()
    read_data_weather()
    
    # 2. Formatowanie
    data = {
        "city": CITY,
        "temp_ins": f"{temperature:.1f} °C",
        "hum_ins": f"{humidity:.1f} %",
        "pressure": f"{pressure:.1f} hPa",
        "temp_out": f"{temp_o} °C",
        "wind": wind,
        "due_date": dt
    }
    
    # 3. Wysłanie do bazy
    try:
        collection = get_database()
        # UWAGA: delete_many({}) kasuje historię! Zostawia tylko 1 wpis (aktualny stan).
        # Jeśli chcesz historię, usuń linijkę delete_many.
        # collection.delete_many({}) 
        collection.insert_one(data)
        print("\n✅ Wysłano dane:")
        print(data)
    except Exception as e:
        print("❌ Błąd zapisu do MongoDB:", e)

if __name__ == "__main__":
    print(f"🚀 Logger uruchomiony dla miasta: {CITY}")
    print(f"⏱️  Interwał: {INTERVAL} sekund")
    print("⌨️  Wciśnij Ctrl+C aby zatrzymać safely.\n")

    try:
        while True:
            # Wykonaj zadanie
            sendDataToServer()
            
            # Czekaj na kolejny cykl
            # To tutaj Python będzie czekał i wyłapie Ctrl+C natychmiast
            time.sleep(INTERVAL)
            
    except KeyboardInterrupt:
        print("\n👋 Zatrzymano przez użytkownika. Do widzenia!")
        exit(0)