import { Router } from "express";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
const cors = require("cors");
dotenv.config();

const routes = Router();

const corsOptions = {
	origin: "*"
};


routes.get("/", cors(corsOptions), (req, res) => {
  //place your code accessing mongo database here
  async function main() {
    const url = process.env.MONGO_URL;
    const client = new MongoClient(url);

  try{  
    await client.connect();
    await findData(client,"test");

    } catch(e){
        console.error(e);
    } finally{
        await client.close();
    }
   
}

main().catch(console.error);

async function findData(client:any, nameOfListing:string){
    const result = await client.db("smartthermodatabase").collection("weatherdata").findOne();
    
    /*if (result){
        console.log(`Found a listing in the collection `);
        console.log(result);
    } else {
        console.log(`No listing found`)
    }*/



  //const exampleResponse = { "city": "Krakow", "Temperature": "0 Celcius"};

  return res.json(result);
}
});

export default routes;
