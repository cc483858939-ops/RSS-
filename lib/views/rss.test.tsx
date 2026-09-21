import { renderToString } from 'hono/jsx/dom/server';
import { describe, expect, it } from 'vitest';

import RSS from '@/views/rss';

describe('RSS view', () => {
    it('renders itunes, media, and telegram image variants', () => {
        const html = renderToString(
            <RSS
                data={{
                    title: 'RSS Feed',
                    link: 'https://t.me/s/rsshub',
                    atomlink: 'https://example.com/feed.xml',
                    description: 'RSS Description',
                    language: 'en',
                    lastBuildDate: '2024-01-01T00:00:00Z',
                    ttl: 60,
                    itunes_author: 'Podcast Author',
                    itunes_category: 'Tech',
                    itunes_explicit: 'true',
                    image: 'https://example.com/image.jpg',
                    item: [
                        {
                            title: 'Episode One',
                            link: 'https://example.com/one',
                            description: 'Episode One',
                            guid: 'episode-1',
                            pubDate: '2024-01-01T00:00:00Z',
                            author: 'Host',
                            image: 'https://example.com/episode.jpg',
                            itunes_item_image: 'https://example.com/itunes.jpg',
                            itunes_duration: '01:02:03',
                            enclosure_url: 'https://example.com/audio.mp3',
                            enclosure_length: 123,
                            enclosure_type: 'audio/mpeg',
                            category: 'Podcast',
                            media: {
                                content: {
                                    url: 'https://example.com/media.mp4',
                                },
                            },
                        },
                        {
                            title: 'Episode Two',
                            link: 'https://example.com/two',
                            description: 'Episode Two',
                            category: ['News', 'Updates'],
                        },
                    ],
                }}
            />
        );

        expect(html).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"');
        expect(html).toContain('xmlns:media="http://search.yahoo.com/mrss/"');
        expect(html).toContain('<itunes:author>Podcast Author</itunes:author>');
        expect(html).toContain('itunes:category text="Tech"');
        expect(html).toContain('<itunes:explicit>true</itunes:explicit>');
        expect(html).toContain('<height>31</height>');
        expect(html).toContain('<width>88</width>');
        expect(html).toContain('media:content');
        expect(html).toContain('<itunes:image href="https://example.com/itunes.jpg"');
        expect(html).toContain('<enclosure url="https://example.com/audio.mp3"');
        expect(html).toContain('<category>Podcast</category>');
        expect(html).toContain('<category>News</category>');
    });

    it('renders NexusFeed profile banner metadata when the channel opts in', () => {
        const html = renderToString(
            <RSS
                data={{
                    title: 'Fixture',
                    profileBannerUrl: 'https://pbs.twimg.com/profile_banners/7/123',
                }}
            />
        );

        expect(html).toContain('xmlns:nexusfeed="urn:nexusfeed:rss:1.0"');
        expect(html).toContain('<nexusfeed:profileBanner>https://pbs.twimg.com/profile_banners/7/123</nexusfeed:profileBanner>');
    });

    it('renders an empty profile banner element when the channel has no banner', () => {
        const html = renderToString(<RSS data={{ title: 'Fixture', profileBannerUrl: '' }} />);

        expect(html).toContain('xmlns:nexusfeed="urn:nexusfeed:rss:1.0"');
        expect(html).toContain('<nexusfeed:profileBanner></nexusfeed:profileBanner>');
    });

    it('does not add NexusFeed metadata to unrelated channels', () => {
        const html = renderToString(<RSS data={{ title: 'Fixture' }} />);

        expect(html).not.toContain('xmlns:nexusfeed=');
        expect(html).not.toContain('nexusfeed:profileBanner');
    });
});
