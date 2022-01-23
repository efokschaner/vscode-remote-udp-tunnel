import * as net from "net";
import * as dgram from "dgram";

export interface Hostname {
  host: string;
  port: number;
}

export function decodeUdpFromTcp(
  srcTcpSocket: net.Socket,
  dstUdpSocket: dgram.Socket,
  dstUdpAddress: Hostname
) {
  let bytesToNextHeader = 0;
  srcTcpSocket.on("data", (data) => {
    // Split tcp stream back in to datagrams
    // Eliminates any artificial combination by TCP
    // May add fragmentation which did not previously exist
    let readIndex = 0;
    while (readIndex < data.length) {
      if (bytesToNextHeader === 0) {
        bytesToNextHeader = data.readUInt16BE(0);
        readIndex += 2;
      }
      let bytesToSend = Math.min(data.length - readIndex, bytesToNextHeader);
      dstUdpSocket.send(
        data.slice(readIndex, readIndex + bytesToSend),
        dstUdpAddress.port,
        dstUdpAddress.host
      );
      readIndex += bytesToSend;
      bytesToNextHeader -= bytesToSend;
    }
  });
}

export function encodeDatagramToTcpStream(msg: Buffer, tcpSocket: net.Socket) {
  let lengthHeader = Buffer.alloc(2);
  lengthHeader.writeUInt16BE(msg.length);
  tcpSocket.write(lengthHeader);
  tcpSocket.write(msg);
}
