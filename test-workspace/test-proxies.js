const {
  getUdpReverseProxyForTcp,
} = require("remote-udp-tunnel-lib/out/ui-proxy");
const {
  getTcpReverseProxyForUdp,
} = require("remote-udp-tunnel-lib/out/workspace-proxy");
const { testServer } = require("./client");
const { serve } = require("./server");

async function main() {
  let server = await serve(1000);
  let tcpToUdp = await getTcpReverseProxyForUdp({
    host: "127.0.0.1",
    port: server.address().port,
  });
  let udpToTcp = await getUdpReverseProxyForTcp(1900, tcpToUdp.listenPort);
  await testServer(udpToTcp.listenPort);
}

if (require.main === module) {
  main().then(
    () => {
      console.log("Run complete");
      process.exit(0);
    },
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}
