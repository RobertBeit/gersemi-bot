const express = require("express");
const cors = require("cors");

const botRoutes = require("./routes/botRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_request, response) => {
  response.status(200).json({
    status: "ok",
    message: "stock-app-bot is running",
  });
});

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.use("/api/bot", botRoutes);

module.exports = app;