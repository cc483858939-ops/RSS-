import { describe, expect, it } from 'vitest';

import { extractBottomCursor } from '../../lib/routes/twitter/api/web-api/utils';

const cursorEntry = (entryId: string, value: string, cursorType?: string) => ({
    entryId,
    content: {
        entryType: 'TimelineTimelineCursor',
        value,
        ...(cursorType && { cursorType }),
    },
});

describe('Twitter timeline cursor extraction', () => {
    it('prefers a typed bottom cursor from TimelineAddEntries', () => {
        const instructions = [
            {
                type: 'TimelineAddEntries',
                entries: [cursorEntry('cursor-top-1', 'top', 'Top'), cursorEntry('cursor-bottom-1', 'bottom', 'Bottom')],
            },
        ];

        expect(extractBottomCursor(instructions)).toBe('bottom');
    });

    it('supports a bottom cursor from TimelineReplaceEntry', () => {
        const instructions = [{ type: 'TimelineReplaceEntry', entry: cursorEntry('cursor-bottom-replace', 'replacement', 'Bottom') }];

        expect(extractBottomCursor(instructions)).toBe('replacement');
    });

    it('supports a replacement whose cursor entry id is on the instruction', () => {
        const instructions = [
            {
                type: 'TimelineReplaceEntry',
                entryId: 'cursor-bottom-replace-instruction',
                entry: { content: { value: 'replacement-instruction' } },
            },
        ];

        expect(extractBottomCursor(instructions)).toBe('replacement-instruction');
    });

    it('uses the structural cursor-bottom fallback and ignores top cursors', () => {
        const instructions = [
            {
                type: 'TimelineAddEntries',
                entries: [cursorEntry('cursor-top-1', 'top', 'Top'), cursorEntry('cursor-bottom-fallback', 'fallback')],
            },
        ];

        expect(extractBottomCursor(instructions)).toBe('fallback');
    });

    it('does not return a non-bottom cursor', () => {
        const instructions = [{ type: 'TimelineAddEntries', entries: [cursorEntry('cursor-top-1', 'top', 'Top')] }];

        expect(extractBottomCursor(instructions)).toBeUndefined();
    });
});
