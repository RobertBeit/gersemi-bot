const express = require("express");

const {
  startBot,
  stopBot,
  getBotStatus,
  getLatestQuote,
} = require("../controllers/botController");

const router = express.Router();

router.post("/start", startBot);
router.post("/stop", stopBot);
router.get("/status", getBotStatus);
router.get("/status/:symbol", getBotStatus);
router.get("/quote/:symbol", getLatestQuote);

module.exports = router;