
This extension is actually 2 extensions which makes development a bit complicated.

So far, the best setup I have found is:

```bash
npm run watch
```

From a **non-remote** vscode instance, launch the "Debug Extensions" target defined in .vscode/launch.json

Or to run without debugging:
```
code --extensionDevelopmentPath=C:\path\to\vscode-remote-udp-tunnel\ui-extension --extensionDevelopmentPath=C:\path\to\vscode-remote-udp-tunnel\workspace-extension
```
