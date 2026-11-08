import axios from 'axios';
import discordOAuth from '../pages/api/discord/[action]';

jest.mock('axios', () => ({ get: jest.fn() }));

const createResponse = () => {
  const res = {
    setHeader: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
    end: jest.fn(),
    redirect: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.end.mockReturnValue(res);
  res.redirect.mockReturnValue(res);
  return res;
};

describe('Discord OAuth API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('proxies signup to the website backend and redirects to Discord', async () => {
    axios.get.mockResolvedValue({
      status: 302,
      headers: { location: 'https://discord.com/oauth2/authorize?client_id=test' },
    });
    const res = createResponse();

    await discordOAuth({
      method: 'GET',
      query: { action: 'signup' },
      headers: { cookie: 'session=test', 'user-agent': 'Mozilla/5.0 Test Browser' },
    }, res);

    expect(axios.get).toHaveBeenCalledWith(
      'http://127.0.0.1:5000/auth/discord-signup',
      expect.objectContaining({
        maxRedirects: 0,
        headers: { cookie: 'session=test', 'user-agent': 'Mozilla/5.0 Test Browser' },
      }),
    );
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://discord.com/oauth2/authorize?client_id=test');
  });

  it('does not forward unsupported routes or non-GET requests', async () => {
    const unsupportedResponse = createResponse();
    await discordOAuth({ method: 'GET', query: { action: 'unknown' } }, unsupportedResponse);

    expect(unsupportedResponse.status).toHaveBeenCalledWith(404);
    expect(axios.get).not.toHaveBeenCalled();

    const methodResponse = createResponse();
    await discordOAuth({ method: 'POST', query: { action: 'signup' } }, methodResponse);

    expect(methodResponse.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    expect(methodResponse.status).toHaveBeenCalledWith(405);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('rejects redirects outside Discord authorization', async () => {
    axios.get.mockResolvedValue({
      status: 302,
      headers: { location: 'https://attacker.example/oauth2/authorize' },
    });
    const res = createResponse();

    await discordOAuth({ method: 'GET', query: { action: 'login' } }, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
