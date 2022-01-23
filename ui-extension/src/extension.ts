// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { ProxyServer, getUdpReverseProxyForTcp } from "./ui-proxy";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let proxies = new Array<ProxyServer>();
  context.subscriptions.push({
    dispose: () => {
      proxies.forEach((p) => {
        p.close();
      });
    },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "remote-udp-tunnel-ui.openLocalProxy",
      async (desiredUdpPort?: unknown, targetTcpPort?: unknown) => {
        if (typeof desiredUdpPort !== "number") {
          throw new Error(`Expected a number but got ${desiredUdpPort}`);
        }
        if (typeof targetTcpPort !== "number") {
          throw new Error(`Expected a number but got ${targetTcpPort}`);
        }
        let proxy = await getUdpReverseProxyForTcp(
          desiredUdpPort,
          targetTcpPort
        );
        proxies.push(proxy);
        return proxy.port;
      }
    )
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
