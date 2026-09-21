import { describe, expect, it } from 'vitest';

import { getBoundedUserTweets, getProfileBannerUrl, type TimelinePageFetcher } from '../../lib/routes/twitter/api/web-api/api';
import type { ApiParams, TimelinePage } from '../../lib/routes/twitter/api/web-api/utils';

const tweetEntry = (id: string) => ({
    entryId: `tweet-${id}`,
    content: {
        itemContent: {
            tweet_results: {
                result: {
                    rest_id: id,
                    core: {
                        user_results: {
                            result: {
                                rest_id: '42',
                                core: { name: 'Fixture User', screen_name: 'fixture' },
                                avatar: { image_url: 'https://fixture.test/avatar.jpg' },
                            },
                        },
                    },
                    legacy: {
                        id_str: id,
                        user_id_str: '42',
                        full_text: `fixture tweet ${id}`,
                        entities: { urls: [] },
                    },
                },
            },
        },
    },
});

const page = (ids: string[], nextCursor?: string): TimelinePage => ({
    entries: ids.map((id) => tweetEntry(id)),
    nextCursor,
});

const sequentialPages = (): TimelinePage[] => [
    page(
        Array.from({ length: 20 }, (_, index) => `${index + 1}`),
        'cursor-page-2'
    ),
    page(
        Array.from({ length: 20 }, (_, index) => `${index + 21}`),
        'cursor-page-3'
    ),
    page(Array.from({ length: 20 }, (_, index) => `${index + 41}`)),
];

const createFetcher = (pages: TimelinePage[]) => {
    const calls: ApiParams[] = [];
    const fetchPage: TimelinePageFetcher = (variables) => {
        calls.push(variables);
        return Promise.resolve(pages[Math.min(calls.length - 1, pages.length - 1)]);
    };
    return { calls, fetchPage };
};

describe('bounded UserTweets pagination', () => {
    it.each([
        ['default', undefined, 20, 1],
        ['20', 20, 20, 1],
        ['21', 21, 21, 2],
        ['40', 40, 40, 2],
        ['60', 60, 60, 3],
        ['100 is clamped', 100, 60, 3],
    ] as const)('uses bounded pages for count %s', async (_label, count, expectedItems, expectedRequests) => {
        const { calls, fetchPage } = createFetcher(sequentialPages());
        const params = count === undefined ? {} : { count };

        const tweets = await getBoundedUserTweets('42', params, fetchPage);

        expect(tweets).toHaveLength(expectedItems);
        expect(calls).toHaveLength(expectedRequests);
        expect(calls.every((variables) => variables.count === 20)).toBe(true);
        expect(calls[0]).not.toHaveProperty('cursor');
        expect(calls.slice(1).map((variables) => variables.cursor)).toEqual(['cursor-page-2', 'cursor-page-3'].slice(0, expectedRequests - 1));
        expect(tweets.map((tweet) => tweet.id_str)).toEqual(Array.from({ length: expectedItems }, (_, index) => `${index + 1}`));
    });

    it('does not mutate caller variables and creates a new cursor request object', async () => {
        const params = { count: 40, includeReplies: false };
        const original = { ...params };
        const { calls, fetchPage } = createFetcher(sequentialPages());

        await getBoundedUserTweets('42', params, fetchPage);

        expect(params).toEqual(original);
        expect(calls[0]).not.toBe(calls[1]);
        expect(calls[1]).toMatchObject({ ...original, count: 20, cursor: 'cursor-page-2' });
    });

    it('stops when a page has no bottom cursor', async () => {
        const { calls, fetchPage } = createFetcher([page(Array.from({ length: 20 }, (_, index) => `${index + 1}`))]);

        const tweets = await getBoundedUserTweets('42', { count: 40 }, fetchPage);

        expect(calls).toHaveLength(1);
        expect(tweets).toHaveLength(20);
    });

    it('stops on a repeated cursor', async () => {
        const ids = Array.from({ length: 20 }, (_, index) => `${index + 1}`);
        const { calls, fetchPage } = createFetcher([page(ids, 'cursor-loop'), page(ids, 'cursor-loop')]);

        const tweets = await getBoundedUserTweets('42', { count: 60 }, fetchPage);

        expect(calls).toHaveLength(2);
        expect(tweets).toHaveLength(20);
    });

    it('stops on an empty page without following its cursor', async () => {
        const { calls, fetchPage } = createFetcher([page([], 'cursor-empty'), page(['1'])]);

        const tweets = await getBoundedUserTweets('42', { count: 40 }, fetchPage);

        expect(calls).toHaveLength(1);
        expect(tweets).toHaveLength(0);
    });

    it('deduplicates hydrated tweets while preserving first-seen order', async () => {
        const { calls, fetchPage } = createFetcher([page(['1', '2', '3'], 'cursor-next'), page(['3', '4', '2', '5'])]);

        const tweets = await getBoundedUserTweets('42', { count: 40 }, fetchPage);

        expect(calls).toHaveLength(2);
        expect(tweets.map((tweet) => tweet.id_str)).toEqual(['1', '2', '3', '4', '5']);
    });

    it('stops when a page contributes no new tweet entries', async () => {
        const ids = Array.from({ length: 20 }, (_, index) => `${index + 1}`);
        const { calls, fetchPage } = createFetcher([page(ids, 'cursor-next'), page(ids, 'cursor-after-duplicate')]);

        const tweets = await getBoundedUserTweets('42', { count: 60 }, fetchPage);

        expect(calls).toHaveLength(2);
        expect(tweets).toHaveLength(20);
    });

    it('propagates a page failure instead of returning partial data', async () => {
        let calls = 0;
        const fetchPage: TimelinePageFetcher = (_variables) => {
            calls++;
            if (calls === 2) {
                return Promise.reject(new Error('fixture page failure'));
            }
            return Promise.resolve(
                page(
                    Array.from({ length: 20 }, (_, index) => `${index + 1}`),
                    'cursor-page-2'
                )
            );
        };

        await expect(getBoundedUserTweets('42', { count: 40 }, fetchPage)).rejects.toThrow('fixture page failure');
        expect(calls).toBe(2);
    });
});

describe('X profile banner extraction', () => {
    it('extracts the modern direct shape', () => {
        expect(getProfileBannerUrl({ profile_banner_url: 'https://pbs.twimg.com/profile_banners/1/100' })).toBe('https://pbs.twimg.com/profile_banners/1/100');
    });

    it('extracts the legacy shape', () => {
        expect(getProfileBannerUrl({ legacy: { profile_banner_url: 'https://pbs.twimg.com/profile_banners/1/200' } })).toBe('https://pbs.twimg.com/profile_banners/1/200');
    });

    it('returns an empty string when the banner is missing', () => {
        expect(getProfileBannerUrl({})).toBe('');
        expect(getProfileBannerUrl(null)).toBe('');
    });

    it('trims banner URLs', () => {
        expect(getProfileBannerUrl({ profile_banner_url: '  https://pbs.twimg.com/profile_banners/1/300  ' })).toBe('https://pbs.twimg.com/profile_banners/1/300');
    });
});
