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
    return `Port number must be an integer between ${MIN_PORT_INCLUSIVE} and ${MAX_PORT_EXCLUSIVE}`;
  }
  return parsed;
}

function parseTarget(input: string): Hostname | string {
  let parts = input.split(":");
  if (parts.length > 2) {
    return 'Too many ":" in address';
  }
  let maybePort = parsePort(parts[parts.length - 1]);
  if (typeof maybePort === "string") {
    return maybePort;
  }
  let host = "127.0.0.1";
  if (parts.length > 1) {
    host = parts[0];
  }
  return { host, port: maybePort };
}

function validateTarget(input: string): string | undefined {
  let maybeParsed = parseTarget(input);
  if (typeof maybeParsed === "string") {
    return maybeParsed;
  }
}

async function resolveTargetParam(targetParam?: unknown): Promise<Hostname> {
  if (targetParam === undefined) {
    targetParam = await vscode.window.showInputBox({
      prompt: "Port number or address (eg. 3000 or 10.10.10.10:2000)",
      validateInput: validateTarget,
    });
    if (targetParam === undefined) {
      throw new Error("No Port number or address provided");
    }
  }
  let target: Hostname | undefined = undefined;
  if (typeof targetParam === "string") {
    let maybeTarget = parseTarget(targetParam);
    if (typeof maybeTarget === "string") {
      throw new Error(maybeTarget);
    }
    target = maybeTarget;
  } else if (typeof targetParam === "number") {
    target = { host: "127.0.0.1", port: targetParam };
  } else if (targetParam instanceof ProxyTreeItem) {
    target = targetParam.proxy.target;
  }

  if (target === undefined) {
    throw new Error("Could not interpret port number or address");
  }
  return target;
}

function validateTargetRange(input: string): string | undefined {
  let maybeParsed = input.split(",");
  if (maybeParsed.length !== 2) {
    return `Expected 2 numbers seperated by a comma, not ${maybeParsed.length}`;
  }
}

async function resolveTargetRangeParam(
  targetParam?: unknown,
): Promise<Hostname[]> {
  if (targetParam === undefined) {
    targetParam = await vscode.window.showInputBox({
      prompt:
        "Port number and port count seperated by a comma (eg. 1000,25 or 8080,4)",
      validateInput: validateTargetRange,
    });
    if (targetParam === undefined) {
      throw new Error("No port number specified");
    }
  }
  let targets: Hostname[] = [];
  if (typeof targetParam === "string") {
    let maybeTarget = targetParam.split(",");
    if (maybeTarget.length === 2) {
      let maybeTargetStart = parsePort(maybeTarget[0]);
      let maybeTargetCount = parsePort(maybeTarget[1]);
      if (
        typeof maybeTargetStart === "number" &&
        typeof maybeTargetCount === "number"
      ) {
        for (let i = 0; i < maybeTargetCount; i++) {
          targets.push({
            host: "127.0.0.1",
            port: maybeTargetStart + i,
          });
        }
      }
    }
  }
  return targets;
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
        let target = await resolveTargetParam(targetParam);
        let proxy = await getTcpReverseProxyForUdp(target);
        let cleanup = new Array<{ (): void }>(() => proxy.close());
        try {
          let message = `Proxy to ${target.host}:${target.port}/udp listening on ${proxy.listenPort}/tcp`;
          // Create tunnel
          // The benefit of this method vs remote.tunnel.forwardCommandPalette is that
          // we can discover the port which was allocated on the ui-side
          let externalUri = await vscode.env.asExternalUri(
            vscode.Uri.from({
              scheme: "http",
              authority: `127.0.0.1:${proxy.listenPort}`,
            }),
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
            uiTcpTunnelPort,
          );
          cleanup.push(async () => {
            await vscode.commands.executeCommand(
              "remote-udp-tunnel-ui.closeLocalProxy",
              uiTcpTunnelPort,
            );
          });
          vscode.window.showInformationMessage(
            `${selectedUiUdpPort}/udp forwarded to ${target.host}:${target.port}/udp in the remote environment, via the TCP tunnel ${uiTcpTunnelPort}->${proxy.listenPort}`,
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
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "remote-udp-tunnel.forwardPortRange",
      async (targetParam?: unknown) => {
        let targets = await resolveTargetRangeParam(targetParam);
        for (let target of targets) {
          let proxy = await getTcpReverseProxyForUdp(target);
          let cleanup = new Array<{ (): void }>(() => proxy.close());
          try {
            let message = `Proxy to ${target.host}:${target.port}/udp listening on ${proxy.listenPort}/tcp`;
            // Create tunnel
            // The benefit of this method vs remote.tunnel.forwardCommandPalette is that
            // we can discover the port which was allocated on the ui-side
            let externalUri = await vscode.env.asExternalUri(
              vscode.Uri.from({
                scheme: "http",
                authority: `127.0.0.1:${proxy.listenPort}`,
              }),
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
              uiTcpTunnelPort,
            );
            cleanup.push(async () => {
              await vscode.commands.executeCommand(
                "remote-udp-tunnel-ui.closeLocalProxy",
                uiTcpTunnelPort,
              );
            });
            vscode.window.showInformationMessage(
              `${selectedUiUdpPort}/udp forwarded to ${target.host}:${target.port}/udp in the remote environment, via the TCP tunnel ${uiTcpTunnelPort}->${proxy.listenPort}`,
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
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "remote-udp-tunnel.stopForwardingPort",
      async (targetParam?: unknown) => {
        let target = await resolveTargetParam(targetParam);
        for (let [index, proxy] of proxies.entries()) {
          if (
            proxy.target.host === target.host &&
            proxy.target.port === target.port
          ) {
            proxy.close();
            proxies.splice(index, 1);
          }
        }
      },
    ),
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
