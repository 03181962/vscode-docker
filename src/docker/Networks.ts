/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerObject } from './Common';

export type DriverType = 'host' | 'bridge' | 'macvlan';

export interface DockerNetwork extends DockerObject {
    readonly driver: DriverType;
}

export type DockerNetworkInspection = DockerNetwork