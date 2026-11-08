import axios from 'axios';
import discordOAuth from '../pages/api/discord/[action]';

jest.mock('axios', () => ({ request: jest.fn() }));

const createResponse = () => {
  const res = {
    setHeader: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
    end: jest.fn(),
    redirect: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  res.end.mockReturnValue(res);
  res.redirect.mockReturnValue(res);
  return res;
};

describe('Discord OAuth API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('proxies signup to the website backend and redirects to Discord', async () => {
    axios.request.mockResolvedValue({
      status: 302,
      headers: { location: 'https://discord.com/oauth2/authorize?client_id=test' },
    });
    const res = createResponse();

    await discordOAuth({
      method: 'GET',
      query: { action: 'signup' },
      headers: { cookie: 'session=test', 'user-agent': 'Mozilla/5.0 Test Browser' },
    }, res);

    expect(axios.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: 'http://127.0.0.1:5000/auth/discord-signup',
        maxRedirects: 0,
        headers: { cookie: 'session=test', 'user-agent': 'Mozilla/5.0 Test Browser' },
    }));
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://discord.com/oauth2/authorize?client_id=test');
  });

  it('does not forward unsupported routes or non-GET requests', async () => {
    const unsupportedResponse = createResponse();
    await discordOAuth({ method: 'GET', query: { action: 'unknown' } }, unsupportedResponse);

    expect(unsupportedResponse.status).toHaveBeenCalledWith(404);
    expect(axios.request).not.toHaveBeenCalled();

    const methodResponse = createResponse();
    await discordOAuth({ method: 'POST', query: { action: 'signup' } }, methodResponse);

    expect(methodResponse.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    expect(methodResponse.status).toHaveBeenCalledWith(405);
    expect(axios.request).not.toHaveBeenCalled();
  });

  it('rejects redirects outside Discord authorization', async () => {
    axios.request.mockResolvedValue({
      status: 302,
      headers: { location: 'https://attacker.example/oauth2/authorize' },
    });
    const res = createResponse();

    await discordOAuth({ method: 'GET', query: { action: 'login' }, headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('proxies signup metadata with the browser cookie', async () => {
    axios.request.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { isDiscordVerified: true, discordUsername: 'tester' },
    });
    const res = createResponse();

    await discordOAuth({
      method: 'GET',
      query: { action: 'signup-metadata' },
      headers: { cookie: 'MARINE-DISCORD=test', 'user-agent': 'Mozilla/5.0 Test Browser' },
    }, res);

    expect(axios.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: 'http://127.0.0.1:5000/apisite/auth/v2/signup-metadata',
      headers: expect.objectContaining({ cookie: 'MARINE-DISCORD=test' }),
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({ isDiscordVerified: true, discordUsername: 'tester' });
  });

  it('proxies account creation body and CSRF headers and returns backend cookies', async () => {
    const signupBody = { username: 'tester', password: 'strong-password', captchaToken: 'captcha' };
    axios.request.mockResolvedValue({
      status: 201,
      headers: {
        'content-type': 'application/json',
        'set-cookie': ['session=new-session'],
      },
      data: { userId: 123 },
    });
    const res = createResponse();

    await discordOAuth({
      method: 'POST',
      query: { action: 'create-account' },
      headers: {
        cookie: 'MARINE-DISCORD=test',
        'user-agent': 'Mozilla/5.0 Test Browser',
        'x-csrf-token': 'csrf-token',
      },
      body: signupBody,
    }, res);

    expect(axios.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'http://127.0.0.1:5000/apisite/auth/v2/signup',
      data: signupBody,
      headers: expect.objectContaining({
        cookie: 'MARINE-DISCORD=test',
        'x-csrf-token': 'csrf-token',
      }),
    }));
    expect(res.setHeader).toHaveBeenCalledWith('set-cookie', ['session=new-session']);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.send).toHaveBeenCalledWith({ userId: 123 });
  });
});
