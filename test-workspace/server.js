const dgram = require("dgram");

const packets = require("./packets");

function serve(port) {
  return new Promise((resolve, reject) => {
    let socket = dgram.createSocket("udp4");
    // CLEANUP
    socket.on("close", () => {
      reject(new Error("Socket Closed"));
    });
    socket.on("error", (err) => {
      console.error(`Error: ${err.message}\n${err.stack}`);
      reject(err);
      socket.close();
    });
    // ROUTING
    socket.on("message", (msg, rinfo) => {
      // console.log(`on messages: ${msg.length}`);
      try {
        packets.validatePacket(msg);
      } catch (err) {
        console.error("A packet failed to validate: %s", err.message);
      }
      socket.send(msg, rinfo.port, rinfo.address);
    });
    // STARTUP
    socket.bind(port, "127.0.0.1", () => {
      let address = socket.address();
      console.log(`Echo server listening on port ${address.port}`);
      resolve(socket);
    });
  });
}

function main() {
  let port = 0;
  if (process.argv.length > 2) {
    port = parseInt(process.argv[2]);
  }
  serve(port);
}

module.exports = { serve };

if (require.main === module) {
  main();
}
