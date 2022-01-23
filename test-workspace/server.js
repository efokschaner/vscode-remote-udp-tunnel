const dgram = require("dgram");

function serve(port) {
  let socket = dgram.createSocket("udp4");
  // CLEANUP
  socket.on("error", (err) => {
    console.error(`Error:\n${err.stack}`);
    socket.close();
  });
  // ROUTING
  socket.on("message", (msg, rinfo) => {
    console.log(
      `Echoing ${msg.length} bytes back to ${rinfo.address}:${rinfo.port}`
    );
    socket.send(msg, rinfo.port, rinfo.address);
  });
  // STARTUP
  socket.bind(port, "127.0.0.1", () => {
    let address = socket.address();
    console.log(`Echo server listening on port ${address.port}`);
  });
}

function main() {
  let port = 0;
  if (process.argv.length > 2) {
    port = parseInt(process.argv[2]);
  }
  serve(port);
}

if (require.main === module) {
  main();
}
