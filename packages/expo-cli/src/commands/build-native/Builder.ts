import os from 'os';
import path from 'path';

import { Platform, prepareJob } from '@expo/build-tools';
import { ExpoConfig } from '@expo/config';
import { ApiV2, User } from '@expo/xdl';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

import { makeProjectTarballAsync, waitForBuildEndAsync } from './utils';
import log from '../../log';
import { UploadType, uploadAsync } from '../../uploads';

export interface StatusResult {
  builds: BuildInfo[];
}

export interface BuildInfo {
  status: string;
  platform: Platform;
  createdAt: string;
  artifacts?: BuildArtifacts;
}

interface BuildArtifacts {
  buildUrl?: string;
  logsUrl: string;
}

interface PresignedPost {
  url: string;
  fields: object;
}

export interface BuilderContext {
  projectDir: string;
  user: User;
  accountName: string;
  projectName: string;
  exp: ExpoConfig;
}

export default class Builder {
  client: ApiV2;
  ctx: BuilderContext;

  constructor(ctx: BuilderContext) {
    this.ctx = ctx;
    this.client = ApiV2.clientForUser(ctx.user);
  }

  async buildProjectAsync(platform: Platform): Promise<string> {
    const projectId = await this.ensureProjectExistsAsync();
    return await this.buildAsync(platform, projectId);
  }

  async getLatestBuildsAsync(): Promise<StatusResult> {
    throw new Error('not implemented yet');
    // return await this.client.getAsync('builds');
  }

  private async ensureProjectExistsAsync(): Promise<string> {
    const { accountName, projectName } = this.ctx;

    try {
      const [{ id }] = await this.client.getAsync('projects', {
        experienceName: `@${accountName}/${projectName}`,
      });
      return id;
    } catch (err) {
      if (err.code !== 'EXPERIENCE_NOT_FOUND') {
        throw err;
      }
    }

    const { id } = await this.client.postAsync('projects', {
      accountName,
      projectName,
      privacy: this.ctx.exp.privacy || 'public',
    });
    return id;
  }

  private async buildAsync(platform: Platform, projectId: string): Promise<string> {
    const tarPath = path.join(os.tmpdir(), `${uuidv4()}.tar.gz`);
    try {
      await makeProjectTarballAsync(tarPath);

      log('Uploading project to AWS S3');
      const archiveUrl = await uploadAsync(UploadType.TURTLE_PROJECT_SOURCES, tarPath);

      const job = await prepareJob(platform, archiveUrl, this.ctx.projectDir);
      const { buildId } = await this.client.postAsync(`projects/${projectId}/builds`, {
        job: job as any,
      });

      return await waitForBuildEndAsync(this.client, buildId);
    } finally {
      await fs.remove(tarPath);
    }
  }
}
