# test-workspace

Demonstrates the Remote UDP Tunnel extension in action.

Contains a small UDP echo server and test client for experimentation.

`test-proxies.js` runs our upd proxy machinery without vscode.

Performance testing can be done with `iperf3`. Eg.

In the remote environment:

```bash
iperf3 --server --port 50288
```

On the same machine as the UI:

```bash
iperf3 --client 127.0.0.1 --udp --port 50288
# Also try adding the `--reverse` flag to test the opposite direction
```

Note that iperf3 requires a TCP metadata connection in addition to the UDP channel. This works well when the local port matches the remote port because VSCode also automatically opens the TCP port tunnel. However when these port numbers do not match, you can manually add another TCP port forward in VSCode for testing.

The order of operations to achieve this is a little tricky as VSCode itself for some reason won't bind the TCP port if the UDP proxy has already bound it. Here's what works:

1. Before launching iperf server.
1. Forward VSCode port 50288.
1. Change local port on VSCode port menu to 5029.
1. Launch iperf server.
1. Forward UDP port 50288.
1. Again, forward UDP port 50288 to get a collision and instead get 50289.
1. Now test iperf against 50289 locally.
