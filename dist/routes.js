"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cors = require("cors");
const routes = (0, express_1.Router)();
const corsOptions = {
    origin: "*"
};
routes.get("/", cors(corsOptions), (req, res) => {
    //place your code accessing mongo database here
    const exampleResponse = { "city": "Krakow", "Temperature": "0 Celcius" };
    return res.json(exampleResponse);
});
exports.default = routes;
//# sourceMappingURL=routes.js.map