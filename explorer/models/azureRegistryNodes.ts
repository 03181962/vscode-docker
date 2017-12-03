import * as vscode from 'vscode';
import * as path from 'path';
import * as moment from 'moment';
import * as request from 'request-promise';

import { NodeBase } from './nodeBase';
import { SubscriptionClient, ResourceManagementClient, SubscriptionModels } from 'azure-arm-resource';
import { AzureAccount, AzureSession } from '../../typings/azure-account.api';
import { RegistryType } from './registryType';

export class AzureRegistryNode extends NodeBase {
    private _azureAccount: AzureAccount;

    constructor(
        public readonly label: string,
        public readonly contextValue: string,
        public readonly iconPath: any = {},
        public readonly azureAccount?: AzureAccount
    ) {
        super(label);
        this._azureAccount = azureAccount;
    }

    public type: RegistryType;
    public subscription: SubscriptionModels.Subscription;
    public userName: string;
    public password: string;

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            contextValue: this.contextValue,
            iconPath: this.iconPath
        }
    }

    async getChildren(element: AzureRegistryNode): Promise<AzureRepositoryNode[]> {
        const repoNodes: AzureRepositoryNode[] = [];
        let node: AzureRepositoryNode;

        const tenantId: string = element.subscription.tenantId;
        if (!this._azureAccount) {
            return [];
        }

        const session: AzureSession = this._azureAccount.sessions.find((s, i, array) => s.tenantId.toLowerCase() === tenantId.toLowerCase());
        const { accessToken, refreshToken } = await acquireToken(session);

        if (accessToken && refreshToken) {
            let refreshTokenARC;
            let accessTokenARC;

            await request.post('https://' + element.label + '/oauth2/exchange', {
                form: {
                    grant_type: 'access_token_refresh_token',
                    service: element.label,
                    tenant: tenantId,
                    refresh_token: refreshToken,
                    access_token: accessToken
                }
            }, (err, httpResponse, body) => {
                if (body.length > 0) {
                    refreshTokenARC = JSON.parse(body).refresh_token;
                } else {
                    return [];
                }
            });

            await request.post('https://' + element.label + '/oauth2/token', {
                form: {
                    grant_type: 'refresh_token',
                    service: element.label,
                    scope: 'registry:catalog:*',
                    refresh_token: refreshTokenARC
                }
            }, (err, httpResponse, body) => {
                if (body.length > 0) {
                    accessTokenARC = JSON.parse(body).access_token;
                } else {
                    return [];
                }
            });

            await request.get('https://' + element.label + '/v2/_catalog', {
                auth: {
                    bearer: accessTokenARC
                }
            }, (err, httpResponse, body) => {
                if (body.length > 0) {
                    const repositories = JSON.parse(body).repositories;
                    for (let i = 0; i < repositories.length; i++) {
                        node = new AzureRepositoryNode(repositories[i], "azureRepository");
                        node.repository = element.label;
                        node.subscription = element.subscription;
                        node.accessTokenARC = accessTokenARC;
                        node.refreshTokenARC = refreshTokenARC;
                        node.userName = element.userName;
                        node.password = element.password;
                        repoNodes.push(node);
                    }
                }
            });
        }

        return repoNodes;
    }
}

export class AzureRepositoryNode extends NodeBase {

    constructor(
        public readonly label: string,
        public readonly contextValue: string,
        public readonly iconPath = {
            light: path.join(__filename, '..', '..', '..', '..', 'images', 'light', 'Repository_16x.svg'),
            dark: path.join(__filename, '..', '..', '..', '..', 'images', 'dark', 'Repository_16x.svg')
        }
    ) {
        super(label);
    }

    public repository: string;
    public subscription: any;
    public accessTokenARC: string;
    public refreshTokenARC: string;
    public userName: string;
    public password: string;

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            contextValue: this.contextValue,
            iconPath: this.iconPath
        }
    }

    async getChildren(element: AzureRepositoryNode): Promise<AzureImageNode[]> {
        const imageNodes: AzureImageNode[] = [];
        let node: AzureImageNode;
        let created: string = '';
        let refreshTokenARC;
        let accessTokenARC;
        let tags;

        const { accessToken, refreshToken } = await acquireToken(element.subscription.session);

        if (accessToken && refreshToken) {
            const tenantId = element.subscription.tenantId;

            await request.post('https://' + element.repository + '/oauth2/exchange', {
                form: {
                    grant_type: 'access_token_refresh_token',
                    service: element.repository,
                    tenant: tenantId,
                    refresh_token: refreshToken,
                    access_token: accessToken
                }
            }, (err, httpResponse, body) => {
                if (body.length > 0) {
                    refreshTokenARC = JSON.parse(body).refresh_token;
                } else {
                    return [];
                }
            });

            await request.post('https://' + element.repository + '/oauth2/token', {
                form: {
                    grant_type: 'refresh_token',
                    service: element.repository,
                    // scope: 'repository:' + element.label + ':pull',
                    scope: 'repository:' + element.label + ':*',
                    refresh_token: refreshTokenARC
                }
            }, (err, httpResponse, body) => {
                if (body.length > 0) {
                    accessTokenARC = JSON.parse(body).access_token;
                } else {
                    return [];
                }
            });

            await request.get('https://' + element.repository + '/v2/' + element.label + '/tags/list', {
                auth: {
                    bearer: accessTokenARC
                }
            }, (err, httpResponse, body) => {
                if (err) { return []; }
                if (body.length > 0) {
                    tags = JSON.parse(body).tags;
                }
            });

            for (let i = 0; i < tags.length; i++) {
                created = '';
                //let manifest = JSON.parse(await request.get('https://' + element.repository + '/v2/' + element.label + '/manifests/' + tags[i], {
                let manifest = JSON.parse(await request.get(`https://${element.repository}/v2/${element.label}/manifests/${tags[i]}`, {
                    auth: { bearer: accessTokenARC }
                }));
                let digest = JSON.parse(await request.get(`https://${element.repository}/v2/${element.label}/manifests/${tags[i]}`, {
                    auth: { bearer: accessTokenARC },
                    headers: {
                        Accept: 'application/vnd.docker.distribution.manifest.v2+json'
                    }
                }, (err, httpResponse, body) => {
                    console.log(err);
                    console.log(httpResponse);
                    console.log(body);
                }));



                created = moment(new Date(JSON.parse(manifest.history[0].v1Compatibility).created)).fromNow();

                node = new AzureImageNode(`${element.label}:${tags[i]} (${created})`, 'azureImageTag');
                node.serverUrl = element.repository;
                node.userName = element.userName;
                node.password = element.password;
                node.accessTokenARC = accessTokenARC;
                node.manifest = manifest;
                node.digest = digest;

                imageNodes.push(node);

            }

        }
        return imageNodes;
    }
}

export class AzureImageNode extends NodeBase {
    constructor(
        public readonly label: string,
        public readonly contextValue: string
    ) {
        super(label);
    }

    public serverUrl: string;
    public userName: string;
    public password: string;
    public manifest;
    public accessTokenARC;
    public digest;

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            contextValue: this.contextValue
        }
    }
}

export async function deleteAzureImage(ctx: AzureImageNode) {
//scope="repository:web:*",error="insufficient_scope"
    console.log(ctx);

    // await request.post('https://' + element.repository + '/oauth2/token', {
    //     form: {
    //         grant_type: 'refresh_token',
    //         service: element.repository,
    //         scope: 'repository:' + element.label + ':*',
    //         refresh_token: refreshTokenARC
    //     }
    // }, (err, httpResponse, body) => {
    //     if (body.length > 0) {
    //         accessTokenARC = JSON.parse(body).access_token;
    //     } else {
    //         return [];
    //     }
    // });

    console.log(ctx.digest.config.digest);
    
    let url: string = `https://${ctx.serverUrl}/v2/${ctx.manifest.name}/manifests/${ctx.digest.config.digest}`


    let res = await request.delete(`${url}`, {
        auth: { bearer: ctx.accessTokenARC }
    }, (err, httpResponse, body) => {
        console.log(err);
        console.log(httpResponse);
        console.log(body);
    });


    // ctx.digest.config.digest 
    // ctx.manifest.name
    // ctx.manifest.tag
    // ctx.serverUrl

}

export class AzureNotSignedInNode extends NodeBase {
    constructor() {
        super('Sign in to Azure...');
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            command: {
                title: this.label,
                command: 'azure-account.login'
            },
            collapsibleState: vscode.TreeItemCollapsibleState.None
        }
    }
}

export class AzureLoadingNode extends NodeBase {
    constructor() {
        super('Loading...');
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.label,
            collapsibleState: vscode.TreeItemCollapsibleState.None
        }
    }
}

async function acquireToken(session: AzureSession) {
    return new Promise<{ accessToken: string; refreshToken: string; }>((resolve, reject) => {
        const credentials: any = session.credentials;
        const environment: any = session.environment;
        credentials.context.acquireToken(environment.activeDirectoryResourceId, credentials.username, credentials.clientId, function (err: any, result: any) {
            if (err) {
                reject(err);
            } else {
                resolve({
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken
                });
            }
        });
    });
}
