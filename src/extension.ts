import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

class ProjectFileItem extends vscode.TreeItem {
    constructor(
        public readonly uri: vscode.Uri,
        public readonly isDirectory: boolean
    ) {
        super(
            path.basename(uri.fsPath),
            isDirectory
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        this.resourceUri = uri;
        this.contextValue = isDirectory ? 'folder' : 'file';

        this.iconPath = new vscode.ThemeIcon(
            isDirectory ? 'folder' : 'file'
        );

        // Open file when clicked
        if (!isDirectory) {
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [uri]
            };
        }
    }
}

class ProjectFilesProvider
    implements vscode.TreeDataProvider<ProjectFileItem> {

    private readonly changeEmitter =
        new vscode.EventEmitter<
            ProjectFileItem | undefined | void
        >();

    readonly onDidChangeTreeData =
        this.changeEmitter.event;

    refresh(): void {
        this.changeEmitter.fire();
    }

    getTreeItem(
        element: ProjectFileItem
    ): vscode.TreeItem {
        return element;
    }

    async getChildren(
        element?: ProjectFileItem
    ): Promise<ProjectFileItem[]> {

        // Root = opened workspace
        if (!element) {
            const folders =
                vscode.workspace.workspaceFolders ?? [];

            return folders.map(
                folder =>
                    new ProjectFileItem(
                        folder.uri,
                        true
                    )
            );
        }

        // File has no children
        if (!element.isDirectory) {
            return [];
        }

        try {
            const entries =
                await vscode.workspace.fs.readDirectory(
                    element.uri
                );

            const items: ProjectFileItem[] = [];

            for (const [name, type] of entries) {

                // Skip folders/files we don't want to display
                if (
                    name === 'node_modules' ||
                    name === '.git' ||
                    name === 'dist' ||
                    name === 'out' ||
                    name === '__pycache__'
                ) {
                    continue;
                }

                const uri =
                    vscode.Uri.joinPath(
                        element.uri,
                        name
                    );

                const isDirectory =
                    (type &
                        vscode.FileType.Directory) !== 0;

                items.push(
                    new ProjectFileItem(
                        uri,
                        isDirectory
                    )
                );
            }

            // Folders first, then files
            return items.sort((a, b) => {

                if (
                    a.isDirectory !==
                    b.isDirectory
                ) {
                    return a.isDirectory
                        ? -1
                        : 1;
                }

                return a.label!
                    .toString()
                    .localeCompare(
                        b.label!.toString()
                    );
            });

        } catch (error) {
            console.error(
                'Error reading directory:',
                error
            );

            return [];
        }
    }
}

/**
 * Write project files to Output panel.
 */
function listFiles(
    directory: string,
    output: vscode.OutputChannel,
    indent = ''
): void {

    let entries: fs.Dirent[];

    try {
        entries = fs.readdirSync(
            directory,
            {
                withFileTypes: true
            }
        );
    } catch (error) {

        output.appendLine(
            `${indent}[Unable to read folder] ${directory}`
        );

        return;
    }

    entries
        .filter(entry =>
            entry.name !== 'node_modules' &&
            entry.name !== '.git' &&
            entry.name !== 'dist' &&
            entry.name !== 'out' &&
            entry.name !== '__pycache__'
        )
        .sort((a, b) => {

            if (
                a.isDirectory() !==
                b.isDirectory()
            ) {
                return a.isDirectory()
                    ? -1
                    : 1;
            }

            return a.name.localeCompare(
                b.name
            );
        })
        .forEach(entry => {

            const fullPath =
                path.join(
                    directory,
                    entry.name
                );

            if (entry.isDirectory()) {

                output.appendLine(
                    `${indent}📁 ${entry.name}/`
                );

                listFiles(
                    fullPath,
                    output,
                    indent + '  '
                );

            } else {

                output.appendLine(
                    `${indent}📄 ${entry.name}`
                );
            }
        });
}


export function activate(
    context: vscode.ExtensionContext
) {

    // -----------------------------------------
    // OUTPUT
    // -----------------------------------------

    const output =
        vscode.window.createOutputChannel(
            'Project Files'
        );

    // -----------------------------------------
    // TREE PROVIDER
    // -----------------------------------------

    const provider =
        new ProjectFilesProvider();

    const tree =
        vscode.window.createTreeView(
            'projectFiles',
            {
                treeDataProvider: provider,
                showCollapseAll: true
            }
        );

    context.subscriptions.push(tree);


    // -----------------------------------------
    // REFRESH COMMAND
    // -----------------------------------------

    const refreshCommand =
        vscode.commands.registerCommand(
            'ext.refresh',
            () => {

                const workspace =
                    vscode.workspace.workspaceFolders?.[0];

                if (!workspace) {

                    vscode.window.showWarningMessage(
                        'Please open a project folder first.'
                    );

                    output.clear();

                    output.appendLine(
                        'No project folder is open.'
                    );

                    output.show(true);

                    return;
                }

                const projectPath =
                    workspace.uri.fsPath;


                // Refresh left Project Files tree
                provider.refresh();


                // Refresh Output
                output.clear();

                output.appendLine(
                    'PROJECT FILES'
                );

                output.appendLine(
                    '================================'
                );

                output.appendLine(
                    `Project: ${projectPath}`
                );

                output.appendLine('');


                listFiles(
                    projectPath,
                    output
                );


                output.appendLine('');

                output.appendLine(
                    '================================'
                );

                output.appendLine(
                    'Finished.'
                );


                // Open Output panel
                output.show(true);
            }
        );

    context.subscriptions.push(
        refreshCommand
    );


    // -----------------------------------------
    // AUTOMATIC FILE WATCHER
    // -----------------------------------------

    const watcher =
        vscode.workspace.createFileSystemWatcher(
            '**/*'
        );

    watcher.onDidCreate(
        () => provider.refresh()
    );

    watcher.onDidDelete(
        () => provider.refresh()
    );

    watcher.onDidChange(
        () => provider.refresh()
    );

    context.subscriptions.push(
        watcher
    );


    // -----------------------------------------
    // WORKSPACE CHANGES
    // -----------------------------------------

    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(
            () => provider.refresh()
        )
    );


    // -----------------------------------------
    // CLEANUP
    // -----------------------------------------

    context.subscriptions.push(
        output
    );
}


export function deactivate() {}

