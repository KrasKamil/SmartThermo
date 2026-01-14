import os
import threading
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

# Parametry - można zmieniać
CITY = os.environ.get("CITY", "Kraków")  # domyślnie Kraków, można nadpisać przez .env
USE_SENSOR = os.environ.get("USE_SENSOR", "0") == "1"  # 1 = użyj Sense HAT, 0 = losowe/stałe
INTERVAL = int(os.environ.get("INTERVAL", "180"))  # domyślnie 180 sekund
DB_NAME = os.environ.get("DB_NAME", "smartthermodatabase")
COLLECTION_NAME = os.environ.get("COLLECTION_NAME", "weatherdata")

# Dane do wysyłki

data = {
    "city": CITY,
    "temp_ins": "0",
    "hum_ins": "0",
    "pressure": "0",
    "temp_out": "0",
    "wind": "0",
    "due_date": "0"
}

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
            pressure = sense.get_pressure() + 20
            if pressure == 20:
                pressure = sense.get_pressure() + 20
            humidity = round(humidity, 1)
            pressure = round(pressure, 1)
            temperature = round(temperature, 1)
        except Exception as e:
            print("Błąd Sense HAT:", e)
            temperature = 20
            humidity = 50
            pressure = 1030
    else:
        temperature = round(random.uniform(18, 25), 1)
        humidity = round(random.uniform(30, 60), 1)
        pressure = round(random.uniform(1000, 1040), 1)

def read_data_weather():
    global wind, temp_o, city
    city = CITY
    url = f'https://api.openweathermap.org/data/2.5/weather?q={city},pl&appid={OPENWEATHER_API_KEY}'
    res = requests.get(url)
    # print("DEBUG: Odpowiedź z API openweathermap:", res.status_code, res.text)
    filedata = res.json()
    speed = math.ceil(filedata['wind']['speed'] * 3.6)
    wind = f'{speed} km/h'
    temp_o = math.ceil(round(filedata['main']['temp'] - 273.15, 2))

def sendDataToServer():
    global data, temperature, pressure, humidity
    dt = datetime.now().strftime('%F %T')
    readSensor()
    read_data_weather()
    collection = get_database()
    temp = "%.1f" % temperature
    hum = "%.1f" % humidity
    press = "%.1f" % pressure
    data["city"] = city
    data["temp_ins"] = f'{temp} °C'
    data["hum_ins"] = f'{hum} %'
    data["pressure"] = f'{press} hPa'
    data["temp_out"] = f'{temp_o} °C'
    data["wind"] = wind
    data["due_date"] = dt
    collection.delete_many({})
    collection.insert_one(data)
    print("Wysłano dane:\n", data)
    threading.Timer(INTERVAL, sendDataToServer).start()

if __name__ == "__main__":
    sendDataToServer()
