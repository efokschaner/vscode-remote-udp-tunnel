import * as vscode from "vscode";
import * as dgram from "dgram";
import * as net from "net";

import {
  encodeDatagramToTcpStream,
  decodeUdpFromTcp,
  ProxyServer,
  Hostname,
} from "remote-udp-tunnel-lib";

class SocketEntry {
  public accessedTimeEpochMS = Date.now();
  public socket = new net.Socket();
}

class TcpSocketPool {
  // Map of udp srcaddress:srcport to tcp socket.
  // By having a separate connection per-sender we can infer the destination
  // of response packets when converting tcp to udp on the return leg.
  private sockets = new Map<string, SocketEntry>();

  constructor(private udpSocket: dgram.Socket, private targetPort: number) {}

  public close() {
    clearTimeout(this.sweepIntervalHandle);
    for (let tcpSocket of this.sockets.values()) {
      tcpSocket.socket.destroy();
    }
    this.sockets.clear();
  }

  /**
   * Get or create a net.Socket to channel data for the given udpAddress
   */
  public getOrCreate(udpAddress: Hostname) {
    let key = `${udpAddress.host}:${udpAddress.port}`;
    let socketEntry = this.sockets.get(key);
    if (socketEntry === undefined) {
      socketEntry = new SocketEntry();
      this.sockets.set(key, socketEntry);
      let socket = socketEntry.socket;
      // CLEANUP
      let teardownConn = () => {
        socket.destroy();
        // Ensure we don't delete a new item
        let maybeOurself = this.sockets.get(key);
        if (maybeOurself === socketEntry) {
          this.sockets.delete(key);
        }
      };
      socket.on("error", teardownConn);
      socket.on("close", teardownConn);
      // ROUTING
      decodeUdpFromTcp(socket, this.udpSocket, udpAddress);
      // STARTUP
      socket.connect(this.targetPort, "127.0.0.1");
    }
    socketEntry.accessedTimeEpochMS = Date.now();
    return socketEntry.socket;
  }

  private sweepIntervalMS = 60 * 1000;
  private sweepIntervalHandle = setTimeout(
    () => this.sweepExpiredSockets(),
    this.sweepIntervalMS
  );
  // In my experience, the vscode tcp tunnel will usually (but not always) close the connection pretty soon if we stop sending data.
  private socketExpiryAgeMS = 5 * 60 * 1000;
  private sweepExpiredSockets() {
    try {
      for (let [key, entry] of this.sockets) {
        let expirationHorizonEpochMS = Date.now() - this.socketExpiryAgeMS;
        if (entry.accessedTimeEpochMS < expirationHorizonEpochMS) {
          entry.socket.destroy();
          this.sockets.delete(key);
        }
      }
    } finally {
      this.sweepIntervalHandle = setTimeout(
        () => this.sweepExpiredSockets(),
        this.sweepIntervalMS
      );
    }
  }
}

export function tryGetUdpReverseProxyForTcp(port: number, targetPort: number) {
  return new Promise<ProxyServer>((resolve, reject) => {
    let socket = dgram.createSocket("udp4");
    let tcpSockets = new TcpSocketPool(socket, targetPort);
    // CLEANUP
    socket.on("error", (err) => {
      console.error(`UDP Proxy Server error:\n${err.stack}`);
      reject(err);
      socket.close();
    });
    socket.on("close", () => {
      tcpSockets.close();
      reject(new Error("Server Closed"));
    });

    // ROUTING
    socket.on("message", (msg, rinfo) => {
      let tcpSocket = tcpSockets.getOrCreate({
        host: rinfo.address,
        port: rinfo.port,
      });
      encodeDatagramToTcpStream(msg, tcpSocket);
    });

    // STARTUP
    socket.bind(port, "127.0.0.1", () => {
      let address = socket.address();
      resolve({
        listenPort: address.port,
        listenProtocol: "udp",
        target: { host: "127.0.0.1", port: targetPort },
        targetProtocol: "tcp",
        close() {
          socket.close();
          tcpSockets.close();
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
  desiredPort: number,
  targetPort: number
) {
  let lastError: unknown = undefined;
  for (let portToTry = desiredPort; portToTry < desiredPort + 20; ++portToTry) {
    try {
      return await tryGetUdpReverseProxyForTcp(portToTry, targetPort);
    } catch (err) {
      lastError = err;
      if (err instanceof Error) {
        if (err.message.indexOf("EADDRINUSE") !== -1) {
          console.warn("Trying a different port due to EADDRINUSE: %s", err);
          // Try next port
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}
