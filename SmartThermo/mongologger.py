import os
import threading
import urllib3
from sense_hat import SenseHat
from datetime import datetime
import requests
import math
from pymongo import MongoClient
import pymongo 
import pprint


data={
    "city": "krakow",
    "temp_ins": "0",
    "hum_ins": "0",
    "pressure": "0",
    "temp_out": "0",
    "wind": "0",
    "due_date": "0"
    }

def get_database():
    
    global client
    global collection
    global database_name
    
    connection_string = "mongodb+srv://adminkamil:adminpassword@weatherdata.vitbe4i.mongodb.net/?retryWrites=true&w=majority"
    client = MongoClient(connection_string)
    
    database_name = client.weather
    collection = database_name.weatherdata    

def readSensor():
    
    global temperature
    global humidity
    global pressure
    temperature = 0
    humidity = 0
    pressure = 0
    
    temperature = sense.get_temperature()-16.5
    humidity = sense.get_humidity()
    pressure = sense.get_pressure()+20
    
    if pressure == 20 :
        pressure = sense.get_pressure()+20
        
    humidity = round(humidity,1)
    pressure = round (pressure,1)
    temperature = round(temperature ,1)
    
    
def read_data_weather():
    
    global wind
    global temp_o
    global city
    
    city ="Kraków"
    url = f'https://api.openweathermap.org/data/2.5/weather?q={city},pl&appid=861c80e86a9b137787087ecd368774a4'
    city = "Krakow"
    res =requests.get(url)
    filedata = res.json()
    speed = math.ceil(filedata['wind']['speed']*3.6)
    wind = f'{speed}km/h'
    temp_o = math.ceil(round(filedata['main']['temp']-273.15,2))
    
    
def sendDataToServer():
    
    global data
    global connection
    global temperature
    global pressure
    global humidity
    
    # Getting the current date and time
    dt = datetime.now().strftime('%F %T')    
    readSensor()
    read_data_weather()
    get_database()
    
    temp ="%.1f" %temperature
    hum = "%.1f" %humidity
    press = "%.1f" %pressure
    
    # updating data
    data["city"]= city
    data["temp_ins"]= f'{temp} °C'
    data["hum_ins"] = f'{hum} %'
    data["pressure"] = f'{press} hPa'
    data["temp_out"]= f'{temp_o} °C'
    data["wind"]= wind
    data["due_date"] = dt
    
    # deleting previous data and inserting new one
    collection.delete_many({})
    collection.insert_one(data)
    print("data was send")
    threading.Timer(120,sendDataToServer).start()
    
    

sense = SenseHat()
dbname = get_database()
sendDataToServer()
    
    
    
    

