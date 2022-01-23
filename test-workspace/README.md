# test-workspace

Demonstrates the Remote UDP Tunnel extension in action.

Contains a small UDP echo server and test client for experimentation.

Other testing can be performed with `iperf3`. Eg.

In the remote environment:

```bash
iperf3 --server --port 50288
```

On the same machine as the UI:

```bash
iperf3 --client 127.0.0.1 --udp --port 50288
```
