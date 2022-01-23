// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { Hostname } from "remote-udp-tunnel-lib";

import { getTcpReverseProxyForUdp, ProxyServer } from "./workspace-proxy";

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

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let proxies = new Array<ProxyServer>();
  context.subscriptions.push({
    dispose: () => {
      proxies.forEach((p) => {
        p.close();
        // Try to close the tcp tunnel too
        vscode.commands.executeCommand(
          "remote.tunnel.closeCommandPalette",
          p.port
        );
      });
    },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "remote-udp-tunnel.forwardPort",
      async (targetParam?: unknown) => {
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
        }
        if (target === undefined) {
          throw new Error("Could not interpret port number or address");
        }

        let proxy = await getTcpReverseProxyForUdp(target);
        proxies.push(proxy);
        let message = `Proxy to ${target.host}:${target.port}/udp listening on ${proxy.port}/tcp`;
        console.log(message);

        // Create tunnel
        // The benefit of this method vs remote.tunnel.forwardCommandPalette is that
        // we can discover the port which was allocated on the ui-side
        let externalUri = await vscode.env.asExternalUri(
          vscode.Uri.from({
            scheme: "http",
            authority: `127.0.0.1:${proxy.port}`,
          })
        );
        let uiTcpTunnelPort = parseInt(externalUri.authority.split(":")[1]);
        let selectedUiUdpPort = await vscode.commands.executeCommand(
          "remote-udp-tunnel-ui.openLocalProxy",
          target.port,
          uiTcpTunnelPort
        );
        vscode.window.showInformationMessage(
          `${selectedUiUdpPort}/udp forwarded to ${target.host}:${target.port} in the remote environment, via the TCP tunnel ${uiTcpTunnelPort}->${proxy.port}`
        );
      }
    )
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
