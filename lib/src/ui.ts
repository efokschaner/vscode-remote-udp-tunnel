import * as vscode from "vscode";

import { Hostname, ProxyServer } from "./proxies";

export class ObservableArray<T> implements Iterable<T> {
  private array = new Array<T>();
  constructor() {}

  get length(): number {
    return this.array.length;
  }

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

function targetString(target: Hostname) {
  return target.host === "127.0.0.1"
    ? target.port.toString()
    : `${target.host}:${target.port}`;
}

export class ProxyTreeItem extends vscode.TreeItem {
  constructor(public readonly proxy: ProxyServer) {
    super(
      `${proxy.listenPort}/${proxy.listenProtocol} -> ${targetString(
        proxy.target
      )}/${proxy.targetProtocol}`,
      vscode.TreeItemCollapsibleState.None
    );
    this.tooltip = `A proxy server connecting ${this.label}`;
    this.description = "";
  }

  iconPath = new vscode.ThemeIcon("remote");
}

export function driveTreeViewTitle(
  treeView: vscode.TreeView<ProxyTreeItem>,
  proxies: ObservableArray<ProxyServer>
) {
  let originalTitle = treeView.title;
  proxies.onDidChange(() => {
    if (proxies.length === 0) {
      treeView.title = originalTitle;
    } else {
      treeView.title = `${originalTitle} - ${proxies.length} Open`;
    }
  });
}

export class ProxiesDataProvider
  implements vscode.TreeDataProvider<ProxyTreeItem>
{
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
