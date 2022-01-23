// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import {
  driveTreeViewTitle,
  ObservableArray,
  ProxiesDataProvider,
  ProxyServer,
  ProxyTreeItem,
} from "remote-udp-tunnel-lib";

import { getUdpReverseProxyForTcp } from "./ui-proxy";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let proxies = new ObservableArray<ProxyServer>();
  context.subscriptions.push({
    dispose: () => {
      proxies.forEach((p) => {
        p.close();
      });
    },
  });

  let treeView = vscode.window.createTreeView("remoteUdpTunnelUi", {
    treeDataProvider: new ProxiesDataProvider(proxies),
  });
  driveTreeViewTitle(treeView, proxies);
  context.subscriptions.push(treeView);

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
        return proxy.listenPort;
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "remote-udp-tunnel-ui.closeLocalProxy",
      async (targetTcpPortParam?: unknown) => {
        let targetTcpPort = undefined;
        if (targetTcpPortParam instanceof ProxyTreeItem) {
          targetTcpPort = targetTcpPortParam.proxy.target.port;
        } else if (typeof targetTcpPortParam === "number") {
          targetTcpPort = targetTcpPortParam;
        }
        if (targetTcpPort === undefined) {
          throw new Error(
            `Could not resolve target TCP port from param ${targetTcpPortParam}`
          );
        }
        for (const [index, proxy] of proxies.entries()) {
          if (proxy.target.port === targetTcpPort) {
            proxy.close();
            proxies.splice(index, 1);
          }
        }
      }
    )
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
