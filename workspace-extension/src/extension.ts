// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import {
  Hostname,
  ObservableArray,
  ProxyServer,
  ProxyTreeItem,
  ProxiesDataProvider,
  driveTreeViewTitle,
  getTcpReverseProxyForUdp,
} from "remote-udp-tunnel-lib";

const MIN_PORT_INCLUSIVE = 1;
const MAX_PORT_EXCLUSIVE = 65536;

function parsePort(input: string): number | string {
  let parsed = parseInt(input);
  if (
    isNaN(parsed) ||
    parsed < MIN_PORT_INCLUSIVE ||
    parsed >= MAX_PORT_EXCLUSIVE
  ) {
    return `Port number must be an integer between ${MIN_PORT_INCLUSIVE} and ${MAX_PORT_EXCLUSIVE} but was "${input}"`;
  }
  return parsed;
}

/**
 * Port expressions can be:
 *   A list of ports eg. 2000,2010,2020
 *   A range of ports eg. 2000-2020
 *   A start port and a number of ports eg. 2000x2
 */
function parsePortExpression(input: string): number[] | string {
  let parsed = [];
  if (input.includes("-")) {
    let parts = input.split("-");
    if (parts.length > 2) {
      return 'Too many "-" in port range';
    }
    let maybeStartPort = parsePort(parts[0]);
    if (typeof maybeStartPort === "string") {
      return maybeStartPort;
    }
    let maybeEndPort = parsePort(parts[1]);
    if (typeof maybeEndPort === "string") {
      return maybeEndPort;
    }
    if (maybeStartPort > maybeEndPort) {
      return `Start port (${maybeStartPort}) should be lower than end port (${maybeEndPort})`;
    }
    // start -> end inclusive
    for (let i = maybeStartPort; i <= maybeEndPort; ++i) {
      parsed.push(i);
    }
  } else if (input.includes("x")) {
    let parts = input.split("x");
    if (parts.length > 2) {
      return 'Too many "x" in port x count';
    }
    let maybeStartPort = parsePort(parts[0]);
    if (typeof maybeStartPort === "string") {
      return maybeStartPort;
    }
    let maybeCount = parseInt(parts[1]);
    if (isNaN(maybeCount) || maybeCount < 0) {
      return `Port count must be positive integer, was "${parts[1]}"`;
    }
    for (let i = 0; i < maybeCount; ++i) {
      parsed.push(maybeStartPort + i);
    }
  } else {
    // Try parse a list of one or more ports
    for (let portStr of input.split(",")) {
      let maybePort = parsePort(portStr);
      if (typeof maybePort === "string") {
        if (input.includes(",")) {
          return (
            maybePort +
            "\nPort lists must be comma-separated port numbers (eg. 2001,9042,9099)"
          );
        }
        return maybePort;
      }
      parsed.push(maybePort);
    }
  }
  return parsed;
}

function parseTarget(input: string): Hostname[] | string {
  let parts = input.split(":");
  if (parts.length > 2) {
    return 'Too many ":" in address';
  }
  let maybePorts = parsePortExpression(parts[parts.length - 1]);
  if (typeof maybePorts === "string") {
    return maybePorts;
  }
  const limit = 1000;
  if (maybePorts.length > limit) {
    return `Number of ports specified (${maybePorts.length}) exceeds the limit (${limit})`;
  }
  let host = "127.0.0.1";
  if (parts.length > 1) {
    host = parts[0];
  }
  return maybePorts.map((port) => ({ host, port }));
}

function validateTarget(input: string): string | undefined {
  let maybeParsed = parseTarget(input);
  if (typeof maybeParsed === "string") {
    return maybeParsed;
  }
}

/**
 *
 * @returns undefined if the dialog was canceled
 */
async function resolveTargetParam(
  targetParam?: unknown
): Promise<Hostname[] | undefined> {
  if (targetParam === undefined) {
    targetParam = await vscode.window.showInputBox({
      prompt:
        'Port number or address (eg. "3000" or "10.10.10.10:2000"). ' +
        'Multiple ports can be specified through a list (eg. "2001,2002,2003"), a range (eg. "2001-2003"), or a count eg. ("2001x3")',
      validateInput: validateTarget,
    });
    if (targetParam === undefined) {
      // Dialog was canceled
      return undefined;
    }
  }
  let target: Hostname[] | undefined = undefined;
  if (typeof targetParam === "string") {
    let maybeTarget = parseTarget(targetParam);
    if (typeof maybeTarget === "string") {
      throw new Error(maybeTarget);
    }
    target = maybeTarget;
  } else if (typeof targetParam === "number") {
    target = [{ host: "127.0.0.1", port: targetParam }];
  } else if (targetParam instanceof ProxyTreeItem) {
    target = [targetParam.proxy.target];
  }
  if (target === undefined) {
    throw new Error("Could not interpret port number or address");
  }
  return target;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let proxies = new ObservableArray<ProxyServer>();
  context.subscriptions.push({
    dispose: () => {
      proxies.forEach((p) => p.close());
    },
  });

  let treeView = vscode.window.createTreeView("remoteUdpTunnelWorkspace", {
    treeDataProvider: new ProxiesDataProvider(proxies),
  });
  driveTreeViewTitle(treeView, proxies);
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "remote-udp-tunnel.forwardPort",
      async (targetParam?: unknown) => {
        let targets = await resolveTargetParam(targetParam);
        if (targets === undefined) {
          // Dialog was canceled
          return undefined;
        }
        for (let target of targets) {
          let proxy = await getTcpReverseProxyForUdp(target);
          let cleanup = new Array<{ (): void }>(() => proxy.close());
          try {
            // Create tunnel
            // The benefit of this method vs remote.tunnel.forwardCommandPalette is that
            // we can discover the port which was allocated on the ui-side
            let externalUri = await vscode.env.asExternalUri(
              vscode.Uri.from({
                scheme: "http",
                authority: `127.0.0.1:${proxy.listenPort}`,
              })
            );
            cleanup.push(() => {
              // See https://github.com/microsoft/vscode/blob/9b75bd1f813e683bf46897d85387089ec083fb24/src/vs/workbench/contrib/remote/browser/tunnelView.ts#L1189
              vscode.commands.executeCommand("remote.tunnel.closeInline", {
                remoteHost: "127.0.0.1",
                remotePort: proxy.listenPort,
              });
            });
            let uiTcpTunnelPort = parseInt(externalUri.authority.split(":")[1]);
            let selectedUiUdpPort = await vscode.commands.executeCommand(
              "remote-udp-tunnel-ui.openLocalProxy",
              target.port,
              uiTcpTunnelPort
            );
            cleanup.push(async () => {
              await vscode.commands.executeCommand(
                "remote-udp-tunnel-ui.closeLocalProxy",
                uiTcpTunnelPort
              );
            });
            vscode.window.showInformationMessage(
              `${selectedUiUdpPort}/udp forwarded to ${target.host}:${target.port}/udp in the remote environment, via the TCP tunnel ${uiTcpTunnelPort}->${proxy.listenPort}`
            );
            let onProxyCloseCleanup = cleanup;
            cleanup = [];
            proxies.push({
              ...proxy,
              close() {
                onProxyCloseCleanup.forEach((f) => f());
              },
            });
          } finally {
            cleanup.forEach((f) => f());
          }
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "remote-udp-tunnel.stopForwardingPort",
      async (targetParam?: unknown) => {
        let targets = await resolveTargetParam(targetParam);
        if (targets === undefined) {
          // Dialog was canceled
          return undefined;
        }
        for (let target of targets) {
          for (let [index, proxy] of proxies.entries()) {
            if (
              proxy.target.host === target.host &&
              proxy.target.port === target.port
            ) {
              proxy.close();
              proxies.splice(index, 1);
            }
          }
        }
      }
    )
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
