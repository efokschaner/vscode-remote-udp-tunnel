// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { Hostname, ProxyServer } from "remote-udp-tunnel-lib";

import { getTcpReverseProxyForUdp } from "./workspace-proxy";

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

function targetString(target: Hostname) {
  return target.host === "127.0.0.1"
    ? target.port.toString()
    : `${target.host}:${target.port}`;
}

class ProxyTreeItem extends vscode.TreeItem {
  constructor(public readonly proxy: ProxyServer) {
    super(
      `${proxy.listenPort}/tcp -> ${targetString(proxy.target)}/udp`,
      vscode.TreeItemCollapsibleState.None
    );
    this.tooltip = `A proxy in the remote workspace which bridges ${this.label}`;
    this.description = "";
  }
}

class ObservableArray<T> implements Iterable<T> {
  private array = new Array<T>();
  constructor() {}

  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  // Iteration
  [Symbol.iterator](): Iterator<T, any, undefined> {
    return this.array[Symbol.iterator]();
  }
  entries(): IterableIterator<[number, T]> {
    return this.array.entries();
  }
  forEach(
    callbackfn: (value: T, index: number, array: T[]) => void,
    thisArg?: any
  ): void {
    return this.array.forEach(callbackfn, thisArg);
  }

  // Mutation
  splice(start: number, deleteCount?: number): T[] {
    let result = this.array.splice(start, deleteCount);
    this._onDidChange.fire();
    return result;
  }
  push(...items: T[]): number {
    let result = this.array.push(...items);
    this._onDidChange.fire();
    return result;
  }
}

class ProxiesDataProvider implements vscode.TreeDataProvider<ProxyTreeItem> {
  constructor(private proxies: ObservableArray<ProxyServer>) {
    proxies.onDidChange(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  getTreeItem(element: ProxyTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ProxyTreeItem): Thenable<ProxyTreeItem[]> {
    let results = [];
    if (element === undefined) {
      for (let proxy of this.proxies) {
        results.push(new ProxyTreeItem(proxy));
      }
    }
    return Promise.resolve(results);
  }

  private _onDidChangeTreeData = new vscode.EventEmitter<
    ProxyTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let proxies = new ObservableArray<ProxyServer>();

  vscode.window.registerTreeDataProvider(
    "remoteUdpTunnelWorkspace",
    new ProxiesDataProvider(proxies)
  );

  context.subscriptions.push({
    dispose: () => {
      proxies.forEach((p) => p.close());
    },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "remote-udp-tunnel.forwardPort",
      async (targetParam?: unknown) => {
        let target = await resolveTargetParam(targetParam);
        let proxy = await getTcpReverseProxyForUdp(target);
        let cleanup = new Array<{ (): void }>(() => proxy.close());
        try {
          let message = `Proxy to ${target.host}:${target.port}/udp listening on ${proxy.listenPort}/tcp`;
          console.log(message);
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
            listenPort: proxy.listenPort,
            target: proxy.target,
            close() {
              onProxyCloseCleanup.forEach((f) => f());
            },
          });
        } finally {
          cleanup.forEach((f) => f());
        }
      }
    )
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
      }
    )
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
