import { describe, expect, it } from 'vitest';

import utils from '../../lib/routes/twitter/utils';

describe('Twitter route parameters', () => {
    it('parses strict bounded timeline parameters', () => {
        expect(utils.parseRouteParams('count=60&includeReplies=false&includeRts=false&strict=true')).toMatchObject({
            count: 60,
            include_replies: false,
            include_rts: false,
            strict: true,
        });
    });

    it('keeps strict disabled for legacy route parameters', () => {
        expect(utils.parseRouteParams('exclude_rts_replies')).toMatchObject({
            include_replies: false,
            include_rts: false,
            strict: false,
        });
    });
});
