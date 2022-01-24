# Contributing

This extension is actually 2 extensions, one running inside the remote environment (probably linux) and one running on the local vscode instance (eg. windows)
which makes development a bit complicated, as node_modules need to be loaded on either platform.

In order to give both platforms separate node_modules dirs we use the bindmount configured in the devcontainer.json so that the devcontainer's node_modules dir
is actually a different folder to the node_modules on the host's filesystem.

## Setup for Development

- Clone the repo on your local OS.
- Run `npm install` to set up node_modules for the code which runs on the host machine.
- Open the devcontainer
- Run `npm install` to set up node_modules for the code which runs on the target environment.

## Debugging

So far, the best setup I have found is captured in the launch.json + devcontainer setup.

Launch with `F5`.

## Testing

See the `test-workspace` for more info on testing.

## Architecture

This is evolving as I discover what makes the most sense for VSCode.
So far, the high level structure is to put the majority of the UX and behaviour in the "workspace" extension, the one which runs in the remote workspace, and to use the "ui" extension as a minimal subcomponent to handle what can only be handled on the "local" side of the extension.

## Publishing

```bash
npm run vscode:package --workspaces --if-present
```
