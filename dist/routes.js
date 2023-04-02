"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongodb_1 = require("mongodb");
const cors = require("cors");
const routes = (0, express_1.Router)();
const corsOptions = {
    origin: "*"
};
routes.get("/", cors(corsOptions), (req, res) => {
    //place your code accessing mongo database here
    function main() {
        return __awaiter(this, void 0, void 0, function* () {
            const uri = "mongodb://localhost:27017/";
            const client = new mongodb_1.MongoClient(uri);
            try {
                yield client.connect();
                yield findData(client, "test");
            }
            catch (e) {
                console.error(e);
            }
            finally {
                yield client.close();
            }
        });
    }
    main().catch(console.error);
    function findData(client, nameOfListing) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield client.db("weather").collection("weatherdata").findOne();
            /*if (result){
                console.log(`Found a listing in the collection `);
                console.log(result);
            } else {
                console.log(`No listing found`)
            }*/
            //const exampleResponse = { "city": "Krakow", "Temperature": "0 Celcius"};
            return res.json(result);
        });
    }
});
exports.default = routes;
//# sourceMappingURL=routes.js.map