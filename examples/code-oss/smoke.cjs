const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const vscode = require('vscode');

const exec = promisify(execFile);

exports.run = async () => {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
  assert.equal(folder?.scheme, 'vscode-remote');
  const distro = process.env.WSL_CONNECTOR_DISTRO || 'Ubuntu';
  assert.equal(folder.authority, 'wsl-connector+' + distro);
  const fixture = vscode.Uri.joinPath(folder, 'connector-smoke.txt');
  const document = await vscode.workspace.openTextDocument(fixture);
  await vscode.window.showTextDocument(document);
  assert.equal(document.getText(), 'before\n', 'Use a fresh disposable fixture');
  const edit = new vscode.WorkspaceEdit();
  edit.replace(fixture, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), 'after\n');
  assert.equal(await vscode.workspace.applyEdit(edit), true);
  assert.equal(await document.save(), true);
  const saved = await exec('wsl.exe', ['--distribution', distro, '--exec', '/usr/bin/cat', '--', fixture.path],
    { timeout: 10000, windowsHide: true });
  assert.equal(saved.stdout, 'after\n');
  console.log('WSL_CONNECTOR_EDITOR_SAVE_PASS');
};
