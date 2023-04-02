import { Router } from "express";
import {MongoClient} from "mongodb";
const cors = require("cors");

const routes = Router();

const corsOptions = {
	origin: "*"
};


routes.get("/", cors(corsOptions), (req, res) => {
  //place your code accessing mongo database here
  async function main(){
    const uri ="mongodb+srv://KamilKras:QPMXmaBJFvSU8HUV@cluster0.wocxtx1.mongodb.net/?retryWrites=true&w=majority";

    const client = new MongoClient(uri);

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
    const result = await client.db("weather").collection("weatherdata").findOne();
    
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
