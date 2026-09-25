import { describe, expect, it } from 'vitest';

import { buildSnippet, escapeHtmlAttr } from './embedSnippet';

describe('escapeHtmlAttr', () => {
  it('escapes the characters that could break out of a quoted attribute', () => {
    expect(escapeHtmlAttr(`a&b"c<d>e`)).toBe('a&amp;b&quot;c&lt;d&gt;e');
  });
});

describe('buildSnippet', () => {
  it('renders the script tag and the element with the required attributes', () => {
    const snippet = buildSnippet({
      slotId: '42',
      apiUrl: 'https://api.example',
      scriptUrl: 'https://web.example/embed/open-ad.v1.js',
      width: 300,
      height: 250,
    });
    expect(snippet).toBe(
      '<script type="module" src="https://web.example/embed/open-ad.v1.js"></script>\n' +
        '<open-ad slot-id="42" api="https://api.example" width="300" height="250"></open-ad>',
    );
  });

  it('includes the optional house attributes only when given', () => {
    const withoutHouse = buildSnippet({
      slotId: '1',
      apiUrl: 'https://api.example',
      scriptUrl: 'https://web.example/embed/open-ad.v1.js',
      width: 300,
      height: 250,
    });
    expect(withoutHouse).not.toContain('house-src');
    expect(withoutHouse).not.toContain('house-href');

    const withHouse = buildSnippet({
      slotId: '1',
      apiUrl: 'https://api.example',
      scriptUrl: 'https://web.example/embed/open-ad.v1.js',
      width: 300,
      height: 250,
      houseSrc: 'https://cdn.example/house.png',
      houseHref: 'https://publisher.example',
    });
    expect(withHouse).toContain('house-src="https://cdn.example/house.png"');
    expect(withHouse).toContain('house-href="https://publisher.example"');
  });

  it('HTML-escapes attribute values', () => {
    const snippet = buildSnippet({
      slotId: '1" onmouseover="alert(1)',
      apiUrl: 'https://api.example',
      scriptUrl: 'https://web.example/embed/open-ad.v1.js',
      width: 300,
      height: 250,
    });
    expect(snippet).not.toContain('" onmouseover="alert(1)"');
    expect(snippet).toContain('&quot; onmouseover=&quot;alert(1)');
  });
});
