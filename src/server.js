// .env file sabse pehle load honi chahiye, kisi aur import se pehle
require("dotenv").config();

const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const { initSocket } = require("./sockets");
const { startAuctionWorker } = require("./jobs/auctionWorker");
const { startReconciliationCron } = require("./jobs/auctionReconciliationCron");

const PORT = process.env.PORT || 5000;

// Unhandled promise rejection ko pakadna (e.g. DB query fail hui aur kahin catch nahi hua)
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION! Server band ho raha hai...");
  console.error(err.name, err.message);
  process.exit(1);
});

async function startServer() {
  // Pehle database connect karo, phir hi server start karo
  await connectDB();

  // http.createServer use kar rahe hain (na ki app.listen seedha)
  // taaki Socket.io isi http server ke upar attach ho sake (live bidding ke liye)
  const server = http.createServer(app);

  initSocket(server);

  // Redis available ho tabhi ye start karo — agar REDIS_URL set nahi hai,
  // auction jobs/worker skip ho jaate hain (baaki poora server chalta rehta hai)
  if (process.env.REDIS_URL) {
    startAuctionWorker();
    startReconciliationCron();
  } else {
    console.warn("REDIS_URL set nahi hai — auction background jobs (start/close) SKIP ho rahe hain");
  }

  server.listen(PORT, () => {
    console.log(`Heavy Bazar server chal raha hai port ${PORT} par`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

startServer();
