import { expect } from "chai";
jest.mock('next/config', () => () => ({
  publicRuntimeConfig: {
    backend: {
      baseUrl: 'https://sansy.shop',
      apiFormat: 'https://{0}.roblox.com{1}',
    }
  }
}));

import { UrlUtilities } from "../pages/api/proxy";

describe('UrlUtilities.IsSafe()', () => {
  it('must return that a valid URL is safe', () => {
    const result = UrlUtilities.isSafe('https://www.sansy.shop/test/goodUrl');
    expect(result).eq(true);
  });
  it('must return that a valid uppercase URL is safe', () => {
    const result = UrlUtilities.isSafe(('https://www.sansy.shop/test/goodUrl').toUpperCase());
    expect(result).eq(true);
  });
  it('must allow the configured API service domain', () => {
    const result = UrlUtilities.isSafe('https://users.roblox.com/v1/users/authenticated');
    expect(result).eq(true);
  });
  it('must return that a similar but invalid url is NOT safe', () => {
    for (const item of [
      'https://sansy.evil.example/test/badUrl',
      'https://www.robloxlabs.com/test/badUrl',
      'https://www.roblox.co/test/badUrl',
      'https://www.roblox-com.com/test/badUrl',
    ]) {
      const result = UrlUtilities.isSafe(item);
      expect(result).eq(false);
    }
  });
});