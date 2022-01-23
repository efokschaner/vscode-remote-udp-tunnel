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
