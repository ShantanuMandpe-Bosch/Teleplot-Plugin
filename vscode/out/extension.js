"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
/* eslint-disable no-mixed-spaces-and-tabs */
/* eslint-disable semi */
/* eslint-disable prefer-const */
/* eslint-disable no-useless-escape */
/* eslint-disable no-var */
/* eslint-disable @typescript-eslint/no-var-requires */
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const serialport_1 = require("serialport");
const { SerialPort } = require('serialport'); //require('node-usb-native');
const Readline = require('@serialport/parser-readline');
const UDP_PORT = 47269;
const CMD_UDP_PORT = 47268;
const udp = require('dgram');
var serials = {};
var udpServer = null;
var currentPanel;
var _disposables = [];
var statusBarIcon;
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('teleplot.start', () => {
        startTeleplotServer();
        const workbenchConfig = vscode.workspace.getConfiguration('workbench');
        const toEdit = workbenchConfig.get('configurations');
        console.log("This is the change that shantanu made!!");
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
        // If we already have a panel, show it.
        if (currentPanel) {
            currentPanel.reveal(column);
            return;
        }
        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel('teleplot', 'Teleplot', column || vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))],
            retainContextWhenHidden: true,
            enableCommandUris: true
        });
        currentPanel = panel;
        fs.readFile(path.join(context.extensionPath, 'media', 'index.html'), (err, data) => {
            if (err) {
                console.error(err);
            }
            let rawHTML = data.toString();
            // Replace all urls
            const srcList = rawHTML.match(/src\=\"(.*)\"/g);
            const hrefList = rawHTML.match(/href\=\"(.*)\"/g);
            if (srcList != null && hrefList != null) {
                for (let src of [...srcList, ...hrefList]) {
                    // Extract url only
                    let url = src.split("\"")[1];
                    const extensionURI = vscode.Uri.joinPath(context.extensionUri, "./media/" + url);
                    const webURI = panel.webview.asWebviewUri(extensionURI);
                    const toReplace = src.replace(url, webURI.toString());
                    console.log(url, extensionURI, webURI);
                    rawHTML = rawHTML.replace(src, toReplace);
                }
            }
            // Set default color style to dark
            const teleplotStyle = rawHTML.match(/(.*)_teleplot_default_color_style(.*)/g);
            if (teleplotStyle != null) {
                rawHTML = rawHTML.replace(teleplotStyle.toString(), 'var _teleplot_default_color_style = "dark";');
            }
            panel.webview.html = rawHTML;
        });
        panel.onDidDispose(() => {
            if (udpServer) {
                udpServer.close();
                udpServer = null;
            }
            while (_disposables.length) {
                const x = _disposables.pop();
                if (x)
                    x.dispose();
            }
            _disposables.length = 0;
            for (let s in serials) {
                serials[s].close();
                serials[s] = null;
            }
            currentPanel = null;
        }, null, _disposables);
        panel.webview.onDidReceiveMessage(message => {
            if ("data" in message) {
                var udpClient = udp.createSocket('udp4');
                udpClient.send(message.data, 0, message.data.length, CMD_UDP_PORT, () => {
                    udpClient.close();
                });
            }
            else if ("cmd" in message) {
                runCmd(message);
            }
        }, null, _disposables);
    }));
    statusBarIcon = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarIcon.command = 'teleplot.start';
    statusBarIcon.text = "$(graph-line) Teleplot";
    context.subscriptions.push(statusBarIcon);
    statusBarIcon.show();
}
exports.activate = activate;
function startTeleplotServer() {
    // Setup UDP server
    udpServer = udp.createSocket('udp4');
    udpServer.bind(UDP_PORT);
    // Relay UDP packets to webview
    udpServer.on('message', function (msg, info) {
        currentPanel.webview.postMessage({ data: msg.toString(), fromSerial: false, timestamp: new Date().getTime() });
    });
}
var dataBuffer = "";
function runCmd(msg) {
    let id = ("id" in msg) ? msg.id : "";
    if (msg.cmd == "listSerialPorts") {
        SerialPort.list().then((ports) => {
            currentPanel.webview.postMessage({ id, cmd: "serialPortList", list: ports });
        });
    }
    else if (msg.cmd == "connectSerialPort") {
        if (serials[id]) { //Already exists
            serials[id].close();
            delete serials[id];
        }
        serials[id] = new SerialPort({ baudRate: msg.baud, path: msg.port }, function (err) {
            if (err) {
                console.log("erroror");
                currentPanel.webview.postMessage({ id, cmd: "serialPortError", port: msg.port, baud: msg.baud });
            }
            else {
                console.log("open");
                currentPanel.webview.postMessage({ id, cmd: "serialPortConnect", port: msg.port, baud: msg.baud });
            }
        });
        const parser = serials[id].pipe(new serialport_1.ReadlineParser({ delimiter: '\n' }));
        parser.on('data', function (data) {
            currentPanel.webview.postMessage({ id, data: data.toString(), fromSerial: true, timestamp: new Date().getTime() });
        });
        serials[id].on('close', function (err) {
            currentPanel.webview.postMessage({ id, cmd: "serialPortDisconnect" });
        });
    }
    else if (msg.cmd == "sendToSerial") {
        serials[id].write(msg.text);
    }
    else if (msg.cmd == "disconnectSerialPort") {
        serials[id].close();
        delete serials[id];
    }
    else if (msg.cmd == "saveFile") {
        try {
            exportDataWithConfirmation(path.join(msg.file.name), { JSON: ["json"] }, msg.file.content);
        }
        catch (error) {
            void vscode.window.showErrorMessage("Couldn't write file: " + error);
        }
    }
}
function exportDataWithConfirmation(fileName, filters, data) {
    void vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(fileName),
        filters,
    }).then((uri) => {
        if (uri) {
            const value = uri.fsPath;
            fs.writeFile(value, data, (error) => {
                if (error) {
                    void vscode.window.showErrorMessage("Could not write to file: " + value + ": " + error.message);
                }
                else {
                    void vscode.window.showInformationMessage("Saved " + value);
                }
            });
        }
    });
}
//# sourceMappingURL=extension.js.map