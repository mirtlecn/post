import test from 'node:test';
import assert from 'node:assert/strict';
import { convertMarkdownToHtml } from '../lib/utils/converter.js';
import { getEmbeddedAssetUrl } from '../lib/assets/index.js';

function withFooterEnv(value, callback) {
  const previousValue = process.env.FOOTER;
  if (value === undefined) {
    delete process.env.FOOTER;
  } else {
    process.env.FOOTER = value;
  }

  try {
    return callback();
  } finally {
    if (previousValue === undefined) {
      delete process.env.FOOTER;
    } else {
      process.env.FOOTER = previousValue;
    }
  }
}

test('convertMarkdownToHtml writes page title and topic backlink', () => {
  const html = convertMarkdownToHtml('# Hello', {
    pageTitle: 'Anime Archive',
    topicBackLink: '/anime',
    topicBackLabel: 'anime',
  });

  assert.match(html, /<title>Anime Archive<\/title>/);
  assert.match(html, /href="\/anime"/);
  assert.match(html, /<div style="font-size: 1.3em; font-weight: bold">anime<\/div>/);
  assert.match(html, /<strong>Home<\/strong>/);
  assert.match(html, /<a href="\/anime"><strong>Home<\/strong><\/a> \/  <span style="color: #666;">Anime Archive<\/span>/);
});

test('convertMarkdownToHtml escapes topic label and page title in topic header', () => {
  const html = convertMarkdownToHtml('# Hello', {
    pageTitle: '<Escaped>',
    topicBackLink: '/anime',
    topicBackLabel: '<Anime>',
  });

  assert.match(html, /<div style="font-size: 1.3em; font-weight: bold">&lt;Anime&gt;<\/div>/);
  assert.match(html, /<a href="\/anime"><strong>Home<\/strong><\/a> \/  <span style="color: #666;">&lt;Escaped&gt;<\/span>/);
});

test('convertMarkdownToHtml omits title suffix when pageTitle is missing', () => {
  const html = convertMarkdownToHtml('# Hello', {
    topicBackLink: '/anime',
    topicBackLabel: 'anime',
  });

  assert.match(html, /<strong>Home<\/strong>/);
  assert.doesNotMatch(html, /color: #666/);
});

test('convertMarkdownToHtml falls back to the first heading when pageTitle is missing', () => {
  const html = convertMarkdownToHtml('# Hello');

  assert.match(html, /<title>Hello<\/title>/);
});

test('convertMarkdownToHtml lets gfm-it strip YAML front matter', () => {
  const html = convertMarkdownToHtml('---\ntitle: Hidden\n---\n# Visible');

  assert.match(html, /Visible/);
  assert.doesNotMatch(html, /title: Hidden/);
});

test('convertMarkdownToHtml preserves topic backlink when YAML front matter is present', () => {
  const html = convertMarkdownToHtml('---\ntitle: Hidden\n---\n# Visible', {
    pageTitle: 'Anime Archive',
    topicBackLink: '/anime',
    topicBackLabel: 'anime',
  });

  assert.match(html, /<div style="font-size: 1.3em; font-weight: bold">anime<\/div>/);
  assert.match(html, /<a href="\/anime"><strong>Home<\/strong><\/a> \/  <span style="color: #666;">Anime Archive<\/span>/);
  assert.match(html, /Visible/);
  assert.doesNotMatch(html, /title: Hidden/);
});

test('convertMarkdownToHtml enables fallback social images by default', () => {
  const html = convertMarkdownToHtml('# Hello');

  assert.match(html, /<meta property="og:image" content="https:\/\/picsum\.photos\/seed\/[a-f0-9]{16}\/1200\/630\.jpg\?grayscale">/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/picsum\.photos\/seed\/[a-f0-9]{16}\/1200\/630\.jpg\?grayscale">/);
});

test('convertMarkdownToHtml passes canonical through to gfm-it', () => {
  const html = convertMarkdownToHtml('# Hello', {
    canonical: 'https://example.test/note',
  });

  assert.match(html, /<link rel="canonical" href="https:\/\/example\.test\/note">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/example\.test\/note">/);
});

test('convertMarkdownToHtml advertises raw markdown alternate output', () => {
  const html = convertMarkdownToHtml('# Hello');

  assert.match(html, /<link rel="alternate" type="text\/plain" href="\?raw">/);
  assert.match(html, /<body>\n<!-- hint: append \?raw to view the raw file -->\n+<article class="markdown-body">/);
});

test('convertMarkdownToHtml injects embedded highlight assets for code blocks', () => {
  const html = convertMarkdownToHtml('```js\nconsole.log("hi")\n```');

  assert.match(html, new RegExp(getEmbeddedAssetUrl('highlight-light.css').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, new RegExp(getEmbeddedAssetUrl('highlight-dark.css').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('convertMarkdownToHtml injects embedded toc assets when enough headings exist', () => {
  const html = convertMarkdownToHtml('# One\n\n## Two');

  assert.match(html, new RegExp(getEmbeddedAssetUrl('gfm-addons.css').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, new RegExp(getEmbeddedAssetUrl('gfm-addons.js').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /\/asset\/gfm-addons.css/);
  assert.match(html, /\/asset\/gfm-addons.js/);
});

test('convertMarkdownToHtml omits footer when FOOTER is unset or blank', () => {
  withFooterEnv(undefined, () => {
    const html = convertMarkdownToHtml('# Hello');

    assert.doesNotMatch(html, /post-footer/);
  });

  withFooterEnv('  \n\t  ', () => {
    const html = convertMarkdownToHtml('# Hello');

    assert.doesNotMatch(html, /post-footer/);
  });

  withFooterEnv(Buffer.from('  \n\t  ', 'utf8').toString('base64'), () => {
    const html = convertMarkdownToHtml('# Hello');

    assert.doesNotMatch(html, /post-footer/);
  });

  withFooterEnv('not valid base64', () => {
    const html = convertMarkdownToHtml('# Hello');

    assert.doesNotMatch(html, /post-footer/);
  });
});

test('convertMarkdownToHtml injects configured footer html', () => {
  const footerHtml = 'footer-e8c3a91f <a href="https://example.test/link-42">link-17b92</a>';
  const encodedFooter = Buffer.from(`  ${footerHtml}  `, 'utf8').toString('base64');

  withFooterEnv(encodedFooter, () => {
    const html = convertMarkdownToHtml('# One\n\n## Two');
    const articleEndIndex = html.indexOf('</article>');
    const tocScriptIndex = html.indexOf(getEmbeddedAssetUrl('gfm-addons.js'));
    const footerIndex = html.indexOf('<footer class="markdown-body post-footer">');

    assert.notEqual(footerIndex, -1);
    assert.ok(articleEndIndex < footerIndex);
    assert.ok(tocScriptIndex < footerIndex);
    assert.match(html, /<footer class="markdown-body post-footer">\nfooter-e8c3a91f <a href="https:\/\/example\.test\/link-42">link-17b92<\/a>\n<\/footer>/);
    assert.match(html, /margin-top: auto;/);
    assert.doesNotMatch(html, /#toc-layout-content > article\.markdown-body/);
    assert.doesNotMatch(html, /post-footer a/);
  });
});
