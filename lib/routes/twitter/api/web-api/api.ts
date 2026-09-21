import { config } from '@/config';
import InvalidParameterError from '@/errors/types/invalid-parameter';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';

import { getTwitterUserCacheKey } from '../../utils';
import { baseUrl, gqlFeatures, gqlMap, initGqlMap } from './constants';
import { type ApiParams, fetchTimelinePage, gatherLegacyFromData, paginationTweets, type TimelinePage, twitterGot } from './utils';

const getUserData = (id) =>
    cache.tryGet(`twitter-userdata-${id}`, () => {
        const params = {
            variables: id.startsWith('+')
                ? JSON.stringify({
                      userId: id.slice(1),
                      withSafetyModeUserFields: true,
                  })
                : JSON.stringify({
                      screen_name: id,
                      withSafetyModeUserFields: true,
                  }),
            features: JSON.stringify(id.startsWith('+') ? gqlFeatures.UserByRestId : gqlFeatures.UserByScreenName),
            fieldToggles: JSON.stringify({
                withAuxiliaryUserLabels: false,
            }),
        };

        if (config.twitter.thirdPartyApi) {
            const endpoint = id.startsWith('+') ? gqlMap.UserByRestId : gqlMap.UserByScreenName;

            return ofetch(`${config.twitter.thirdPartyApi}${endpoint}`, {
                method: 'GET',
                params,
                headers: {
                    'accept-encoding': 'gzip',
                },
            });
        }

        return twitterGot(`${baseUrl}${id.startsWith('+') ? gqlMap.UserByRestId : gqlMap.UserByScreenName}`, params, {
            allowNoAuth: !id.startsWith('+'),
        });
    });

const cacheTryGet = async (_id, params, operationName, func) => {
    const userData: any = await getUserData(_id);
    const id = userData.data?.user?.result?.rest_id;
    if (id === undefined) {
        cache.set(`twitter-userdata-${_id}`, '', config.cache.contentExpire);
        throw new InvalidParameterError('User not found');
    }
    return cache.tryGet(getTwitterUserCacheKey(id, operationName, params), () => func(id, params), config.cache.routeExpire, false);
};

const USER_TIMELINE_PAGE_SIZE = 20;
const USER_TIMELINE_MAX_PAGES = 3;
const USER_TIMELINE_MAX_ITEMS = 60;

export type TimelinePageFetcher = (variables: ApiParams) => Promise<TimelinePage>;

const normalizeUserTimelineCount = (count: ApiParams['count']) => {
    const numericCount = Number(count);
    if (count === undefined || !Number.isFinite(numericCount)) {
        return USER_TIMELINE_PAGE_SIZE;
    }
    return Math.min(USER_TIMELINE_MAX_ITEMS, Math.max(1, Math.trunc(numericCount)));
};

export const getBoundedUserTweets = async (id: string | number, params: ApiParams = {}, fetchPage: TimelinePageFetcher = (variables) => fetchTimelinePage('UserTweets', id, variables)) => {
    const requestedCount = normalizeUserTimelineCount(params.count);
    const baseVariables = { ...params } as ApiParams & { cursor?: string };
    delete baseVariables.cursor;
    Object.assign(baseVariables, {
        count: USER_TIMELINE_PAGE_SIZE,
        includePromotedContent: true,
        withQuickPromoteEligibilityTweetFields: true,
        withVoice: true,
        withV2Timeline: true,
    });

    const tweets: any[] = [];
    const seenTweetIds = new Set<string>();
    const seenCursors = new Set<string>();
    const maxPages = Math.min(USER_TIMELINE_MAX_PAGES, Math.ceil(requestedCount / USER_TIMELINE_PAGE_SIZE));
    let cursor: string | undefined;

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
        const variables = cursor ? { ...baseVariables, cursor } : { ...baseVariables };
        // Cursor requests must remain sequential because each cursor comes from the previous page.
        // eslint-disable-next-line no-await-in-loop
        const page = await fetchPage(variables);
        const pageTweets = gatherLegacyFromData(page.entries || []);
        let newTweetEntries = 0;

        for (const tweet of pageTweets) {
            const tweetId = typeof tweet?.id_str === 'string' && tweet.id_str.trim() ? tweet.id_str : undefined;
            if (tweetId) {
                if (seenTweetIds.has(tweetId)) {
                    continue;
                }
                seenTweetIds.add(tweetId);
            }
            tweets.push(tweet);
            newTweetEntries++;
        }

        if (tweets.length >= requestedCount || newTweetEntries === 0) {
            break;
        }

        const nextCursor = page.nextCursor;
        if (!nextCursor || seenCursors.has(nextCursor)) {
            break;
        }
        seenCursors.add(nextCursor);
        cursor = nextCursor;
    }

    return tweets.slice(0, requestedCount);
};

const getUserTweets = (id: string, params?: ApiParams) => cacheTryGet(id, params, 'getUserTweets', (id, params = {}) => getBoundedUserTweets(id, params));

const getUserTweetsAndReplies = (id: string, params?: ApiParams) =>
    cacheTryGet(id, params, 'getUserTweetsAndReplies', async (id, params = {}) =>
        gatherLegacyFromData(
            await paginationTweets('UserTweetsAndReplies', id, {
                ...params,
                count: 20,
                includePromotedContent: true,
                withCommunity: true,
                withVoice: true,
                withV2Timeline: true,
            }),
            ['profile-conversation-'],
            id
        )
    );

const getUserMedia = (id: string, params?: ApiParams) =>
    cacheTryGet(id, params, 'getUserMedia', async (id, params = {}) =>
        gatherLegacyFromData(
            await paginationTweets('UserMedia', id, {
                ...params,
                count: 20,
                includePromotedContent: false,
                withClientEventToken: false,
                withBirdwatchNotes: false,
                withVoice: true,
                withV2Timeline: true,
            })
        )
    );

const getUserLikes = (id: string, params?: ApiParams) =>
    cacheTryGet(id, params, 'getUserLikes', async (id, params = {}) =>
        gatherLegacyFromData(
            await paginationTweets('Likes', id, {
                ...params,
                includeHasBirdwatchNotes: false,
                includePromotedContent: false,
                withBirdwatchNotes: false,
                withVoice: false,
                withV2Timeline: true,
            })
        )
    );

const getUserTweet = (id: string, params?: ApiParams) =>
    cacheTryGet(id, params, 'getUserTweet', async (id, params = {}) =>
        gatherLegacyFromData(
            await paginationTweets(
                'TweetDetail',
                id,
                {
                    ...params,
                    includeHasBirdwatchNotes: false,
                    includePromotedContent: false,
                    withBirdwatchNotes: false,
                    withVoice: false,
                    withV2Timeline: true,
                },
                ['threaded_conversation_with_injections_v2']
            ),
            ['homeConversation-', 'conversationthread-']
        )
    );

const getSearch = async (keywords: string, params?: ApiParams) =>
    gatherLegacyFromData(
        await paginationTweets(
            'SearchTimeline',
            undefined,
            {
                ...params,
                rawQuery: keywords,
                count: 20,
                querySource: 'typed_query',
                product: 'Latest',
            },
            ['search_by_raw_query', 'search_timeline', 'timeline']
        )
    );

const getList = async (id: string, params?: ApiParams) =>
    gatherLegacyFromData(
        await paginationTweets(
            'ListLatestTweetsTimeline',
            undefined,
            {
                ...params,
                listId: id,
                count: 20,
            },
            ['list', 'tweets_timeline', 'timeline']
        ),
        ['listConversation-']
    );

export const getProfileBannerUrl = (result: any): string => {
    const candidates = [result?.profile_banner_url, result?.legacy?.profile_banner_url, result?.profile_banner?.url, result?.profile_banner?.image_url];

    for (const candidate of candidates) {
        if (typeof candidate !== 'string') {
            continue;
        }

        const value = candidate.trim();
        if (value) {
            return value;
        }
    }

    return '';
};

const getUser = async (id: string) => {
    const userData: any = await getUserData(id);
    const result = userData.data?.user?.result;

    if (!userData.data?.user) {
        throw new InvalidParameterError("This account doesn't exist");
    }
    if (result?.__typename === 'UserUnavailable') {
        throw new InvalidParameterError(result.message || 'User is unavailable');
    }

    return {
        ...result?.core,
        profile_image_url: result?.avatar?.image_url,
        profile_banner_url: getProfileBannerUrl(result),
        description: result?.profile_bio?.description,
    };
};

const getHomeTimeline = async (id: string, params?: ApiParams) =>
    gatherLegacyFromData(
        await paginationTweets(
            'HomeTimeline',
            undefined,
            {
                ...params,
                count: 20,
                includePromotedContent: true,
                latestControlAvailable: true,
                requestContext: 'launch',
                withCommunity: true,
            },
            ['home', 'home_timeline_urt']
        )
    );

const getHomeLatestTimeline = async (id: string, params?: ApiParams) =>
    gatherLegacyFromData(
        await paginationTweets(
            'HomeLatestTimeline',
            undefined,
            {
                ...params,
                count: 20,
                includePromotedContent: true,
                latestControlAvailable: true,
                requestContext: 'launch',
                withCommunity: true,
            },
            ['home', 'home_timeline_urt']
        )
    );

export default {
    getUser,
    getUserTweets,
    getUserTweetsAndReplies,
    getUserMedia,
    getUserLikes,
    getUserTweet,
    getSearch,
    getList,
    getHomeTimeline,
    getHomeLatestTimeline,
    init: initGqlMap,
};
