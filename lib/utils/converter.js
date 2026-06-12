/**
 * Content conversion helpers for Markdown and QR code output.
 */

import { renderMarkdownToHtml } from 'gfm-it';
import qrcode from 'qrcode-terminal';

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function prependTopicBackLink(
  markdown,
  { pageTitle = '', topicBackLink = '', topicBackLabel = '' } = {},
) {
  if (!topicBackLink) {
    return markdown;
  }

  const topicHeading = `<div style="font-size: 1.3em; font-weight: bold">${escapeHtml(topicBackLabel)}</div>`;
  const titleSuffix = pageTitle
    ? ` <span style="color: #666;">${escapeHtml(pageTitle)}</span>`
    : '';
  const topicBackLinkMarkdown = `${topicHeading}\n\n[**Home**](<${topicBackLink}>) / ${titleSuffix}\n\n\n\n\n\n`;
  const frontMatter = markdown.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/);

  if (!frontMatter) {
    return `${topicBackLinkMarkdown}${markdown}`;
  }

  return `${frontMatter[0]}${topicBackLinkMarkdown}${markdown.slice(frontMatter[0].length)}`;
}

function getConfiguredFooterHtml() {
  const encodedFooter = process.env.FOOTER?.trim();
  if (!encodedFooter) {
    return '';
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encodedFooter) || encodedFooter.length % 4 !== 0) {
    return '';
  }

  try {
    return Buffer.from(encodedFooter, 'base64').toString('utf8').trim();
  } catch {
    return '';
  }
}

function normalizeMarkdownConversionError(error) {
  return String(error?.message || error).replace(/^Markdown conversion failed: /, '');
}

/**
 * Convert Markdown into a full HTML document.
 */
export function convertMarkdownToHtml(markdown, { pageTitle = '', topicBackLink = '', topicBackLabel = '' } = {}) {
  try {
    const footerHtml = getConfiguredFooterHtml();
    const content = prependTopicBackLink(markdown, { pageTitle, topicBackLink, topicBackLabel });

    return renderMarkdownToHtml(content, {
      title: pageTitle,
      css: 'ravel_gfm_css',
      assetMode: 'local',
      assetBaseUrl: '/asset/',
      footerHtml,
      slots: {
        headEnd: '<link rel="alternate" type="text/plain" href="?raw">',
        bodyStart: '<!-- hint: append ?raw to view the raw file -->',
      },
    });
  } catch (error) {
    throw new Error(`Markdown conversion failed: ${normalizeMarkdownConversionError(error)}`);
  }
}

/**
 * Convert text into a UTF-8 QR code string for terminal-style output.
 */
export function convertToQrCode(text) {
  return new Promise((resolve, reject) => {
    const textLength = text.length;
    
    // Keep the generated QR code within a compact size envelope.
    if (textLength > 250) {
      reject(new Error(
        `QR code conversion failed: input length ${textLength} exceeds 250 characters`
      ));
      return;
    }

    try {
      let qrOutput = '';
      
      // Capture the renderer output as a string instead of writing to stdout.
      qrcode.generate(text, { small: true }, (qr) => {
        qrOutput = qr;
      });

      if (!qrOutput) {
        reject(new Error('QR code generation produced empty output'));
        return;
      }

      const banner = '📷 Scan this QR code';
      resolve(`${banner}\n\n${qrOutput}`);
    } catch (error) {
      reject(new Error(`QR code conversion failed: ${error.message}`));
    }
  });
}
