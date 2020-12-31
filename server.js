const express = require("express");
const path = require("path");

const app = express();

app.get("/", function (req, res) {
    res.sendFile(path.join(__dirname, "basic.html"));
});

app.get("/style", function (req,res) {
    res.sendFile(path.join(__dirname, "styles.css"));
});

app.get("/script.js", function (req,res) {
    res.sendFile(path.join(__dirname, "script.js"));
});



app.listen(8080);

// end
