const dgram = require("dgram");

const packets = require("./packets");

const inspector = require("inspector");
const isDebugging = inspector.url() !== undefined;

class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "TimeoutError";
  }
}

function withTimeout(timeoutMS, promise) {
  return new Promise((resolve, reject) => {
    if (timeoutMS !== Infinity) {
      setTimeout(
        () => reject(new TimeoutError("Timed out")),
        timeoutMS
      ).unref();
    }
    promise.then(resolve, reject);
  });
}

function sendAndReceive(port) {
  let minTimeout = 5000;
  let numPackets = 1024;
  let socket = dgram.createSocket("udp4");
  return withTimeout(
    isDebugging ? Infinity : numPackets * 20 + minTimeout,
    new Promise((resolve, reject) => {
      socket.on("error", (err) => {
        reject(err);
      });
      socket.on("close", function () {
        reject(new Error("Closed"));
      });
      socket.bind(0, "127.0.0.1", () => {
        resolve(socket);
      });
    })
      .then(async (socket) => {
        return new Promise((resolve, reject) => {
          let numValidReceived = 0;
          let numInvalidReceived = 0;
          socket.on("message", (msg) => {
            try {
              packets.validatePacket(msg);
              ++numValidReceived;
            } catch (err) {
              ++numInvalidReceived;
              console.error(err);
            } finally {
              if ((numValidReceived + numInvalidReceived) % 100 === 0) {
                console.log(`numValidReceived: ${numValidReceived}`);
                console.log(`numInvalidReceived: ${numInvalidReceived}`);
              }
              if (numValidReceived + numInvalidReceived >= numPackets) {
                if (numValidReceived / numPackets < 0.99) {
                  reject(new Error("Failed >1% of packets"));
                } else {
                  resolve();
                }
              }
            }
          });
          let numSent = 0;
          function sendMessages() {
            if (numSent < numPackets) {
              let packet = packets.createPacket();
              // console.log(`sendMessages: ${packet.length}`);
              socket.send(packets.createPacket(), port, "127.0.0.1");
              ++numSent;
              setTimeout(sendMessages, 5);
            }
          }
          sendMessages();
        });
      })
      .finally(() => socket.close())
  );
}

function testServer(port) {
  let tests = [];
  for (let i = 0; i < 1; ++i) {
    tests.push(sendAndReceive(port));
  }
  return Promise.all(tests);
}

async function main() {
  if (process.argv.length < 3) {
    throw new Error("A port number must be specified");
  }
  let port = parseInt(process.argv[2]);
  try {
    await testServer(port);
  } catch (e) {
    console.error(e.stack);
    process.exit(1);
  }
}

module.exports = { testServer };

if (require.main === module) {
  main();
}
