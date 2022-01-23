import * as dgram from "dgram";
import * as net from "net";

function hasOwnProperty<X extends {}, Y extends PropertyKey>(
  obj: X,
  prop: Y
): obj is X & Record<Y, unknown> {
  return obj.hasOwnProperty(prop);
}

export interface Hostname {
  host: string;
  port: number;
}

export interface ProxyServer {
  port: number;
  close(): void;
}

/**
 * Get a TCP server listening on 127.0.0.1.
 * The server function as a reverse proxy to a UDP server at @param target
 */
export function getTcpReverseProxyForUdp(target: Hostname) {
  return new Promise<ProxyServer>((resolve, reject) => {
    // tcpServer interacts with the vscode tcp tunnel
    let tcpServer = new net.Server();

    // CLEANUP
    tcpServer.on("error", (err) => {
      console.error(`TCP Proxy Server error:\n${err.stack}`);
      reject(err);
      tcpServer.close();
    });
    tcpServer.on("close", () => reject(new Error("Server Closed")));

    // ROUTING
    tcpServer.on("connection", (tcpSocket) => {
      // udpSocket interacts with the target udp server
      let udpSocket = dgram.createSocket("udp4");

      // CLEANUP
      let closeSockets = () => {
        udpSocket.close();
        tcpSocket.destroy();
      };
      tcpSocket.on("error", closeSockets);
      udpSocket.on("error", closeSockets);
      tcpSocket.on("close", closeSockets);
      udpSocket.on("close", closeSockets);

      // ROUTING
      udpSocket.on("message", (msg) => {
        let lengthHeader = Buffer.alloc(2);
        lengthHeader.writeUInt16BE(msg.length);
        tcpSocket.write(lengthHeader);
        tcpSocket.write(msg);
      });

      let bytesToNextHeader = 0;
      tcpSocket.on("data", (data) => {
        // Split tcp stream back in to datagrams
        // Eliminates any artificial combination by TCP
        // May add fragmentation which did not previously exist
        let readIndex = 0;
        while (readIndex < data.length) {
          if (bytesToNextHeader === 0) {
            bytesToNextHeader = data.readUInt16BE(0);
            readIndex += 2;
          }
          let bytesToSend = Math.min(
            data.length - readIndex,
            bytesToNextHeader
          );
          udpSocket.send(
            data.slice(readIndex, readIndex + bytesToSend),
            target.port,
            target.host
          );
          readIndex += bytesToSend;
          bytesToNextHeader -= bytesToSend;
        }
      });

      // STARTUP
      udpSocket.connect(target.port, target.host);
      let bindAddress = target.host === "127.0.0.1" ? "127.0.0.1" : "0.0.0.0";
      udpSocket.bind(0, bindAddress);
    });

    // STARTUP
    tcpServer.listen(0, "127.0.0.1", () => {
      try {
        let tcpServerAddr = tcpServer.address();
        if (tcpServerAddr === null) {
          tcpServer.close();
          throw new Error("Cannot determine our own port");
        }
        if (!hasOwnProperty(tcpServerAddr, "port")) {
          throw new Error("Cannot determine our own port");
        }
        resolve({
          port: tcpServerAddr.port,
          close: () => {
            tcpServer.close();
          },
        });
      } catch (e) {
        reject(e);
        tcpServer.close();
      }
    });
  });
}
