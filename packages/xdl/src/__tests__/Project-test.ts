import path from 'path';
import { AxiosRequestConfig } from 'axios';

import { attachLoggerStream } from '../project/ProjectUtils';
import UserManager from '../User';
import { publishAsync } from '../Project';

const projectRoot = path.join(__dirname, '../../publish-test-app');

jest.dontMock('fs');
jest.dontMock('resolve-from');

jest.mock('../project/Doctor', () => ({
  async validateWithNetworkAsync() {
    const Doctor = require.requireActual('../project/Doctor');
    return Doctor.NO_ISSUES;
  },
}));

function mockApiV2Response(data: any) {
  return {
    data: {
      data,
    },
  };
}

jest.mock('axios', () => ({
  async request(options: AxiosRequestConfig) {
    const { URL } = jest.requireActual('url');
    const axios = jest.requireActual('axios');

    const { hostname, pathname } = new URL(options.url);

    if (hostname === '127.0.0.1') {
      return axios.request(options);
    } else if (hostname !== 'exp.host') {
      throw new Error(`Test tried to make a request to unknown host ${hostname}`);
    }

    const methodAndPath = options.method.toUpperCase() + ' ' + pathname;
    switch (methodAndPath) {
      case 'POST /--/api/v2/auth/loginAsync':
        return mockApiV2Response({ sessionSecret: 'fake-session-secret' });
      case 'POST /--/api/v2/auth/userProfileAsync':
        return mockApiV2Response({
          id: '7e577e57-7e57-7e57-7e57-c0ffeec0ffee',
          user_id: '7e577e57-7e57-7e57-7e57-c0ffeec0ffee',
          username: 'testing',
          nickname: 'testing',
          picture: 'https://www.gravatar.com/avatar/23463b99b62a72f26ed677cc556c44e8',
        });
      case 'PUT /--/api/v2/publish/new':
        return mockApiV2Response({
          url: 'https://test.exp.host/@testing/publish-test-app',
          ids: ['1', '2'],
        });
      default:
        throw new Error(
          'Test tried to make a request to unmocked endpoint (' + methodAndPath + ')'
        );
    }
  },
}));

describe('publishAsync', () => {
  beforeAll(() => {
    attachLoggerStream(projectRoot, {
      name: 'test-log-output',
      stream: process.stderr,
      level: 'info',
    });
  });

  it('publishes the project to exp.host', async () => {
    jest.setTimeout(180e3);
    await UserManager.loginAsync('user-pass', {
      username: 'testing',
      password: 'fake-password',
    });
    const result = await publishAsync(projectRoot, { quiet: true, resetCache: true });
    expect(result.url).toBe('https://test.exp.host/@testing/publish-test-app');
  });
});
