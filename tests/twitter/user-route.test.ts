import { beforeEach, describe, expect, it, vi } from 'vitest';

import { route } from '../../lib/routes/twitter/user';

const api = vi.hoisted(() => ({
    getUser: vi.fn(),
    getUserTweets: vi.fn(),
    getUserTweetsAndReplies: vi.fn(),
    init: vi.fn(),
}));
const logger = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('../../lib/routes/twitter/api', () => ({ default: api }));
vi.mock('../../lib/utils/logger', () => ({ default: logger }));

const contextFor = (routeParams?: string) =>
    ({
        req: {
            param: (name: string) => ({ id: 'fixture-user', routeParams })[name],
        },
    }) as any;

describe('Twitter user route strict mode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.init.mockResolvedValue(undefined);
        api.getUser.mockResolvedValue({
            name: 'Fixture User',
            screen_name: 'fixture-user',
            profile_image_url: 'https://fixture.test/avatar.jpg',
            profile_banner_url: 'https://pbs.twimg.com/profile_banners/7/123',
        });
    });

    it('rethrows timeline failures for strict routes', async () => {
        api.getUserTweets.mockRejectedValue(new Error('fixture timeline failure'));

        await expect(route.handler(contextFor('count=60&includeReplies=false&includeRts=false&strict=true'))).rejects.toThrow('fixture timeline failure');
        expect(logger.error).toHaveBeenCalledWith('Twitter user timeline fetch failed');
    });

    it('rejects an empty strict feed', async () => {
        api.getUserTweets.mockResolvedValue([]);

        await expect(route.handler(contextFor('count=60&includeReplies=false&includeRts=false&strict=true'))).rejects.toThrow('Strict Twitter user timeline returned no items');
    });

    it('keeps legacy routes compatible by allowing an empty result after an error', async () => {
        api.getUserTweets.mockRejectedValue(new Error('fixture timeline failure'));

        await expect(route.handler(contextFor('exclude_rts_replies'))).resolves.toMatchObject({ allowEmpty: true });
    });

    it('exposes the X profile banner as channel metadata', async () => {
        api.getUserTweets.mockResolvedValue([]);

        const result = await route.handler(contextFor());

        expect(result).toMatchObject({
            image: 'https://fixture.test/avatar.jpg',
            profileBannerUrl: 'https://pbs.twimg.com/profile_banners/7/123',
        });
    });

    it('keeps the profile banner property when the account has no banner', async () => {
        api.getUser.mockResolvedValue({
            name: 'Fixture User',
            screen_name: 'fixture-user',
            profile_image_url: 'https://fixture.test/avatar.jpg',
            profile_banner_url: '',
        });
        api.getUserTweets.mockResolvedValue([]);

        const result = await route.handler(contextFor());

        expect(result).toHaveProperty('profileBannerUrl', '');
    });
});
