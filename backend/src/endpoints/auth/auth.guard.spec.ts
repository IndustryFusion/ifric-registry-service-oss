import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let jwtService: { verifyAsync: jest.Mock };

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    guard = new AuthGuard(jwtService as unknown as JwtService);
  });

  function contextWithAuthHeader(header?: string): ExecutionContext {
    const request: any = { headers: header ? { authorization: header } : {} };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;
  }

  it('rejects when no Authorization header is present', async () => {
    await expect(guard.canActivate(contextWithAuthHeader())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the token fails signature verification', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(
      guard.canActivate(contextWithAuthHeader('Bearer bad-token')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a refresh token (type mismatch)', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'company-1',
      user: 'user@example.com',
      type: 'refresh',
    });

    await expect(
      guard.canActivate(contextWithAuthHeader('Bearer a-refresh-token')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid access token and attaches the payload to the request', async () => {
    const payload = {
      sub: 'company-1',
      user: 'user@example.com',
      type: 'access',
    };
    jwtService.verifyAsync.mockResolvedValue(payload);
    const request: any = { headers: { authorization: 'Bearer a-valid-token' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(payload);
  });
});
