# Contributing

## Setup for Development

- Open the devcontainer
- Run `npm install` in the root dir

## Debugging

This extension is actually 2 extensions which makes development a bit complicated.
So far, the best setup I have found is captured in the launch.json.

Before launching with `F5` set up a configuration in your vscode preferences with the location of the vscode-remote-udp-tunnel workspace on the host machine:

Eg.

```json
{
  "vscode-remote-udp-tunnel.development.workspaceFolderOnUiHost": "C:\\dev\\efokschaner\\vscode-remote-udp-tunnel"
}
```

Ensure you have this repo opened in the root devcontainer and launch with `F5`.
