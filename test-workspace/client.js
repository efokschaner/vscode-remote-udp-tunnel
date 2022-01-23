const { pseudoRandomBytes, randomInt } = require("crypto");
const dgram = require("dgram");

const TYPICALLY_SAFE_MTU_CAP = 1280;

class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "TimeoutError";
  }
}

function withTimeout(timeoutMS, promise) {
  return new Promise((resolve, reject) => {
    setTimeout(() => reject(new TimeoutError("Timed out")), timeoutMS).unref();
    promise.then(resolve, reject);
  });
}

function sendAndReceive(port) {
  let maxAllowedPacketRttMS = 5000;
  let numPackets = 1024;
  let socket = dgram.createSocket("udp4");
  return withTimeout(
    numPackets * 50 + maxAllowedPacketRttMS,
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
        let numFailures = 0;
        let numSuccesses = 0;
        for (let i = 0; i < numPackets; ++i) {
          try {
            await withTimeout(
              maxAllowedPacketRttMS, // Individual packet timeout can vary much more than aggregate
              new Promise((resolve, reject) => {
                let testPacketLen = randomInt(TYPICALLY_SAFE_MTU_CAP);
                let testPacket = pseudoRandomBytes(testPacketLen);
                socket.once("message", (msg) => {
                  console.log(Date.now(), "receive");
                  if (msg.equals(testPacket)) {
                    resolve();
                  }
                  reject(
                    new Error(
                      `Response (length ${msg.length}) did not match request (length ${testPacket.length}).`
                    )
                  );
                });
                console.log(Date.now(), "send");
                socket.send(testPacket, port, "127.0.0.1");
              })
            );
            ++numSuccesses;
          } catch (e) {
            if (!(e instanceof TimeoutError)) {
              throw e;
            }
            ++numFailures;
          }
        }
        if (numSuccesses / (numSuccesses + numFailures) < 0.95) {
          throw new Error("Failed >5% of packets");
        }
      })
      .finally(() => socket.close())
  );
}

function testServer(port) {
  let tests = [];
  for (let i = 0; i < 4; ++i) {
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

if (require.main === module) {
  main();
}
