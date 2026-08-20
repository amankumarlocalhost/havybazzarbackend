/**
 * sockets/index.js
 * ---------------------------------------------------------------------------
 * Har auction ka apna "room" hota hai (`auction:<id>`). Jo log us auction
 * ka page khole baithe hain, sirf unhi ko us auction ke updates jaate
 * hain — baaki auctions ka traffic unko nahi milta.
 *
 * `initSocket()` server.js se call hoga (http server ke saath). Services
 * (auction.service.js) `emitToAuction()` helper use karenge — inhe
 * seedha socket.io internals se matlab nahi rakhna padta.
 * ---------------------------------------------------------------------------
 */

const { Server } = require('socket.io');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    socket.on('auction:join', (auctionId) => {
      socket.join(`auction:${auctionId}`);
    });

    socket.on('auction:leave', (auctionId) => {
      socket.leave(`auction:${auctionId}`);
    });
  });

  console.log('Socket.io initialized — real-time bidding ready');
  return io;
}

/**
 * Services isi function ko call karenge. Agar socket abhi initialize
 * nahi hua (jaise tests me, jahan HTTP server nahi chal raha), to
 * chup-chaap skip ho jaata hai — crash nahi karta. Real-time update na
 * milna ek UX miss hai, poore request ko fail karne ki wajah nahi.
 */
function emitToAuction(auctionId, event, payload) {
  if (!io) {
    return; // socket initialize nahi hua — dev/test context, silently skip
  }
  io.to(`auction:${auctionId}`).emit(event, payload);
}

module.exports = { initSocket, emitToAuction };
