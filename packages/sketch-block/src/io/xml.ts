/** C0 control characters XML 1.0 forbids (tab, LF and CR are allowed). */
// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g

/** Removes characters that are invalid in XML 1.0 (they make an SVG unparseable). */
export const stripControl = (s: string): string => s.replace(XML_INVALID, '')

/** Escapes text / attribute values for SVG markup, dropping XML-invalid control characters. */
export const escXml = (s: string): string =>
  stripControl(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
