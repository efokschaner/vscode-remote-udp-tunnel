import * as vscode from "vscode";
import * as dgram from "dgram";
import * as net from "net";

export interface ProxyServer {
  port: number;
  close(): void;
}

export function tryGetUdpReverseProxyForTcp(port: number, targetPort: number) {
  // Map of udp srcaddress:srcport to tcp socket.
  // My having a separate connection per-sender we can infer the destination
  // of response packets when convering tcp to udp on the return leg.
  let tcpSockets = new Map<string, net.Socket>();

  return new Promise<ProxyServer>((resolve, reject) => {
    let socket = dgram.createSocket("udp4");
    // CLEANUP
    socket.on("error", (err) => {
      console.error(`UDP Proxy Server error:\n${err.stack}`);
      reject(err);
      socket.close();
    });
    socket.on("close", () => {
      reject(new Error("Server Closed"));
    });

    // ROUTING
    socket.on("message", (msg, rinfo) => {
      let key = `${rinfo.address}:${rinfo.port}`;
      let tcpSocket = tcpSockets.get(key);
      if (tcpSocket === undefined) {
        let newTcpSocket = new net.Socket();
        tcpSockets.set(key, newTcpSocket);
        tcpSocket = newTcpSocket;

        // CLEANUP
        let teardownConn = () => {
          newTcpSocket.destroy();
          tcpSockets.delete(key);
        };
        newTcpSocket.on("error", teardownConn);
        newTcpSocket.on("close", teardownConn);

        // ROUTING
        newTcpSocket.on("data", (data) => {
          socket.send(data, rinfo.port, rinfo.address);
        });

        // STARTUP
        newTcpSocket.connect(targetPort, "127.0.0.1", () => {
          newTcpSocket.write("");
        });
      }
      tcpSocket.write(msg);
    });

    // STARTUP
    socket.bind(port, "127.0.0.1", () => {
      let address = socket.address();
      resolve({
        port: address.port,
        close() {
          socket.close();
          for (let tcpSocket of tcpSockets.values()) {
            tcpSocket.destroy();
          }
        },
      });
    });
  });
}

/**
 * Get a UDP server listening on 127.0.0.1:@param port.
 * The server function as a reverse proxy to a TCP server at 127.0.0.1:@param targetPort
 */
export async function getUdpReverseProxyForTcp(
  port: number,
  targetPort: number
) {
  return tryGetUdpReverseProxyForTcp(port, targetPort);
}
