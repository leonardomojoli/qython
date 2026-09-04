// frontend/src/utils/countryConfig.js
/**
 * Internationalization configuration for patient registration.
 *
 * Best Practices Applied:
 * - Complete ISO 3166-1 alpha-2 country list
 * - Separation of concerns: country list vs document configurations
 * - Fallback to flexible format for unconfigured countries
 * - Native country names with English fallback
 */

/**
 * Complete list of countries following ISO 3166-1 alpha-2 standard.
 * Names are in their native form where practical for medical contexts.
 */
export const COUNTRIES = [
    { code: 'af', name: 'Afghanistan', flag: '\u{1F1E6}\u{1F1EB}' },
    { code: 'al', name: 'Albania', flag: '\u{1F1E6}\u{1F1F1}' },
    { code: 'dz', name: 'Algeria', flag: '\u{1F1E9}\u{1F1FF}' },
    { code: 'ad', name: 'Andorra', flag: '\u{1F1E6}\u{1F1E9}' },
    { code: 'ao', name: 'Angola', flag: '\u{1F1E6}\u{1F1F4}' },
    { code: 'ag', name: 'Antigua and Barbuda', flag: '\u{1F1E6}\u{1F1EC}' },
    { code: 'ar', name: 'Argentina', flag: '\u{1F1E6}\u{1F1F7}' },
    { code: 'am', name: 'Armenia', flag: '\u{1F1E6}\u{1F1F2}' },
    { code: 'au', name: 'Australia', flag: '\u{1F1E6}\u{1F1FA}' },
    { code: 'at', name: '\u00D6sterreich', flag: '\u{1F1E6}\u{1F1F9}' },
    { code: 'az', name: 'Azerbaijan', flag: '\u{1F1E6}\u{1F1FF}' },
    { code: 'bs', name: 'Bahamas', flag: '\u{1F1E7}\u{1F1F8}' },
    { code: 'bh', name: 'Bahrain', flag: '\u{1F1E7}\u{1F1ED}' },
    { code: 'bd', name: 'Bangladesh', flag: '\u{1F1E7}\u{1F1E9}' },
    { code: 'bb', name: 'Barbados', flag: '\u{1F1E7}\u{1F1E7}' },
    { code: 'by', name: 'Belarus', flag: '\u{1F1E7}\u{1F1FE}' },
    { code: 'be', name: 'Belgi\u00EB', flag: '\u{1F1E7}\u{1F1EA}' },
    { code: 'bz', name: 'Belize', flag: '\u{1F1E7}\u{1F1FF}' },
    { code: 'bj', name: 'B\u00E9nin', flag: '\u{1F1E7}\u{1F1EF}' },
    { code: 'bt', name: 'Bhutan', flag: '\u{1F1E7}\u{1F1F9}' },
    { code: 'bo', name: 'Bolivia', flag: '\u{1F1E7}\u{1F1F4}' },
    { code: 'ba', name: 'Bosnia and Herzegovina', flag: '\u{1F1E7}\u{1F1E6}' },
    { code: 'bw', name: 'Botswana', flag: '\u{1F1E7}\u{1F1FC}' },
    { code: 'br', name: 'Brasil', flag: '\u{1F1E7}\u{1F1F7}' },
    { code: 'bn', name: 'Brunei', flag: '\u{1F1E7}\u{1F1F3}' },
    { code: 'bg', name: 'Bulgaria', flag: '\u{1F1E7}\u{1F1EC}' },
    { code: 'bf', name: 'Burkina Faso', flag: '\u{1F1E7}\u{1F1EB}' },
    { code: 'bi', name: 'Burundi', flag: '\u{1F1E7}\u{1F1EE}' },
    { code: 'cv', name: 'Cabo Verde', flag: '\u{1F1E8}\u{1F1FB}' },
    { code: 'kh', name: 'Cambodia', flag: '\u{1F1F0}\u{1F1ED}' },
    { code: 'cm', name: 'Cameroon', flag: '\u{1F1E8}\u{1F1F2}' },
    { code: 'ca', name: 'Canada', flag: '\u{1F1E8}\u{1F1E6}' },
    { code: 'cf', name: 'Central African Republic', flag: '\u{1F1E8}\u{1F1EB}' },
    { code: 'td', name: 'Chad', flag: '\u{1F1F9}\u{1F1E9}' },
    { code: 'cl', name: 'Chile', flag: '\u{1F1E8}\u{1F1F1}' },
    { code: 'cn', name: '\u4E2D\u56FD', flag: '\u{1F1E8}\u{1F1F3}' },
    { code: 'co', name: 'Colombia', flag: '\u{1F1E8}\u{1F1F4}' },
    { code: 'km', name: 'Comoros', flag: '\u{1F1F0}\u{1F1F2}' },
    { code: 'cg', name: 'Congo', flag: '\u{1F1E8}\u{1F1EC}' },
    { code: 'cd', name: 'Congo (DRC)', flag: '\u{1F1E8}\u{1F1E9}' },
    { code: 'cr', name: 'Costa Rica', flag: '\u{1F1E8}\u{1F1F7}' },
    { code: 'hr', name: 'Hrvatska', flag: '\u{1F1ED}\u{1F1F7}' },
    { code: 'cu', name: 'Cuba', flag: '\u{1F1E8}\u{1F1FA}' },
    { code: 'cy', name: 'Cyprus', flag: '\u{1F1E8}\u{1F1FE}' },
    { code: 'cz', name: '\u010Cesko', flag: '\u{1F1E8}\u{1F1FF}' },
    { code: 'dk', name: 'Danmark', flag: '\u{1F1E9}\u{1F1F0}' },
    { code: 'dj', name: 'Djibouti', flag: '\u{1F1E9}\u{1F1EF}' },
    { code: 'dm', name: 'Dominica', flag: '\u{1F1E9}\u{1F1F2}' },
    { code: 'do', name: 'Rep\u00FAblica Dominicana', flag: '\u{1F1E9}\u{1F1F4}' },
    { code: 'ec', name: 'Ecuador', flag: '\u{1F1EA}\u{1F1E8}' },
    { code: 'eg', name: 'Egypt', flag: '\u{1F1EA}\u{1F1EC}' },
    { code: 'sv', name: 'El Salvador', flag: '\u{1F1F8}\u{1F1FB}' },
    { code: 'gq', name: 'Equatorial Guinea', flag: '\u{1F1EC}\u{1F1F6}' },
    { code: 'er', name: 'Eritrea', flag: '\u{1F1EA}\u{1F1F7}' },
    { code: 'ee', name: 'Eesti', flag: '\u{1F1EA}\u{1F1EA}' },
    { code: 'sz', name: 'Eswatini', flag: '\u{1F1F8}\u{1F1FF}' },
    { code: 'et', name: 'Ethiopia', flag: '\u{1F1EA}\u{1F1F9}' },
    { code: 'fj', name: 'Fiji', flag: '\u{1F1EB}\u{1F1EF}' },
    { code: 'fi', name: 'Suomi', flag: '\u{1F1EB}\u{1F1EE}' },
    { code: 'fr', name: 'France', flag: '\u{1F1EB}\u{1F1F7}' },
    { code: 'ga', name: 'Gabon', flag: '\u{1F1EC}\u{1F1E6}' },
    { code: 'gm', name: 'Gambia', flag: '\u{1F1EC}\u{1F1F2}' },
    { code: 'ge', name: 'Georgia', flag: '\u{1F1EC}\u{1F1EA}' },
    { code: 'de', name: 'Deutschland', flag: '\u{1F1E9}\u{1F1EA}' },
    { code: 'gh', name: 'Ghana', flag: '\u{1F1EC}\u{1F1ED}' },
    { code: 'gr', name: '\u0395\u03BB\u03BB\u03AC\u03B4\u03B1', flag: '\u{1F1EC}\u{1F1F7}' },
    { code: 'gd', name: 'Grenada', flag: '\u{1F1EC}\u{1F1E9}' },
    { code: 'gt', name: 'Guatemala', flag: '\u{1F1EC}\u{1F1F9}' },
    { code: 'gn', name: 'Guin\u00E9e', flag: '\u{1F1EC}\u{1F1F3}' },
    { code: 'gw', name: 'Guin\u00E9-Bissau', flag: '\u{1F1EC}\u{1F1FC}' },
    { code: 'gy', name: 'Guyana', flag: '\u{1F1EC}\u{1F1FE}' },
    { code: 'ht', name: 'Ha\u00EFti', flag: '\u{1F1ED}\u{1F1F9}' },
    { code: 'hn', name: 'Honduras', flag: '\u{1F1ED}\u{1F1F3}' },
    { code: 'hu', name: 'Magyarorsz\u00E1g', flag: '\u{1F1ED}\u{1F1FA}' },
    { code: 'is', name: '\u00CDsland', flag: '\u{1F1EE}\u{1F1F8}' },
    { code: 'in', name: 'India', flag: '\u{1F1EE}\u{1F1F3}' },
    { code: 'id', name: 'Indonesia', flag: '\u{1F1EE}\u{1F1E9}' },
    { code: 'ir', name: 'Iran', flag: '\u{1F1EE}\u{1F1F7}' },
    { code: 'iq', name: 'Iraq', flag: '\u{1F1EE}\u{1F1F6}' },
    { code: 'ie', name: 'Ireland', flag: '\u{1F1EE}\u{1F1EA}' },
    { code: 'il', name: 'Israel', flag: '\u{1F1EE}\u{1F1F1}' },
    { code: 'it', name: 'Italia', flag: '\u{1F1EE}\u{1F1F9}' },
    { code: 'ci', name: "C\u00F4te d'Ivoire", flag: '\u{1F1E8}\u{1F1EE}' },
    { code: 'jm', name: 'Jamaica', flag: '\u{1F1EF}\u{1F1F2}' },
    { code: 'jp', name: '\u65E5\u672C', flag: '\u{1F1EF}\u{1F1F5}' },
    { code: 'jo', name: 'Jordan', flag: '\u{1F1EF}\u{1F1F4}' },
    { code: 'kz', name: 'Kazakhstan', flag: '\u{1F1F0}\u{1F1FF}' },
    { code: 'ke', name: 'Kenya', flag: '\u{1F1F0}\u{1F1EA}' },
    { code: 'ki', name: 'Kiribati', flag: '\u{1F1F0}\u{1F1EE}' },
    { code: 'kp', name: 'North Korea', flag: '\u{1F1F0}\u{1F1F5}' },
    { code: 'kr', name: '\uD55C\uAD6D', flag: '\u{1F1F0}\u{1F1F7}' },
    { code: 'kw', name: 'Kuwait', flag: '\u{1F1F0}\u{1F1FC}' },
    { code: 'kg', name: 'Kyrgyzstan', flag: '\u{1F1F0}\u{1F1EC}' },
    { code: 'la', name: 'Laos', flag: '\u{1F1F1}\u{1F1E6}' },
    { code: 'lv', name: 'Latvija', flag: '\u{1F1F1}\u{1F1FB}' },
    { code: 'lb', name: 'Lebanon', flag: '\u{1F1F1}\u{1F1E7}' },
    { code: 'ls', name: 'Lesotho', flag: '\u{1F1F1}\u{1F1F8}' },
    { code: 'lr', name: 'Liberia', flag: '\u{1F1F1}\u{1F1F7}' },
    { code: 'ly', name: 'Libya', flag: '\u{1F1F1}\u{1F1FE}' },
    { code: 'li', name: 'Liechtenstein', flag: '\u{1F1F1}\u{1F1EE}' },
    { code: 'lt', name: 'Lietuva', flag: '\u{1F1F1}\u{1F1F9}' },
    { code: 'lu', name: 'Luxembourg', flag: '\u{1F1F1}\u{1F1FA}' },
    { code: 'mg', name: 'Madagascar', flag: '\u{1F1F2}\u{1F1EC}' },
    { code: 'mw', name: 'Malawi', flag: '\u{1F1F2}\u{1F1FC}' },
    { code: 'my', name: 'Malaysia', flag: '\u{1F1F2}\u{1F1FE}' },
    { code: 'mv', name: 'Maldives', flag: '\u{1F1F2}\u{1F1FB}' },
    { code: 'ml', name: 'Mali', flag: '\u{1F1F2}\u{1F1F1}' },
    { code: 'mt', name: 'Malta', flag: '\u{1F1F2}\u{1F1F9}' },
    { code: 'mh', name: 'Marshall Islands', flag: '\u{1F1F2}\u{1F1ED}' },
    { code: 'mr', name: 'Mauritania', flag: '\u{1F1F2}\u{1F1F7}' },
    { code: 'mu', name: 'Mauritius', flag: '\u{1F1F2}\u{1F1FA}' },
    { code: 'mx', name: 'M\u00E9xico', flag: '\u{1F1F2}\u{1F1FD}' },
    { code: 'fm', name: 'Micronesia', flag: '\u{1F1EB}\u{1F1F2}' },
    { code: 'md', name: 'Moldova', flag: '\u{1F1F2}\u{1F1E9}' },
    { code: 'mc', name: 'Monaco', flag: '\u{1F1F2}\u{1F1E8}' },
    { code: 'mn', name: 'Mongolia', flag: '\u{1F1F2}\u{1F1F3}' },
    { code: 'me', name: 'Crna Gora', flag: '\u{1F1F2}\u{1F1EA}' },
    { code: 'ma', name: 'Morocco', flag: '\u{1F1F2}\u{1F1E6}' },
    { code: 'mz', name: 'Mo\u00E7ambique', flag: '\u{1F1F2}\u{1F1FF}' },
    { code: 'mm', name: 'Myanmar', flag: '\u{1F1F2}\u{1F1F2}' },
    { code: 'na', name: 'Namibia', flag: '\u{1F1F3}\u{1F1E6}' },
    { code: 'nr', name: 'Nauru', flag: '\u{1F1F3}\u{1F1F7}' },
    { code: 'np', name: 'Nepal', flag: '\u{1F1F3}\u{1F1F5}' },
    { code: 'nl', name: 'Nederland', flag: '\u{1F1F3}\u{1F1F1}' },
    { code: 'nz', name: 'New Zealand', flag: '\u{1F1F3}\u{1F1FF}' },
    { code: 'ni', name: 'Nicaragua', flag: '\u{1F1F3}\u{1F1EE}' },
    { code: 'ne', name: 'Niger', flag: '\u{1F1F3}\u{1F1EA}' },
    { code: 'ng', name: 'Nigeria', flag: '\u{1F1F3}\u{1F1EC}' },
    { code: 'mk', name: 'North Macedonia', flag: '\u{1F1F2}\u{1F1F0}' },
    { code: 'no', name: 'Norge', flag: '\u{1F1F3}\u{1F1F4}' },
    { code: 'om', name: 'Oman', flag: '\u{1F1F4}\u{1F1F2}' },
    { code: 'pk', name: 'Pakistan', flag: '\u{1F1F5}\u{1F1F0}' },
    { code: 'pw', name: 'Palau', flag: '\u{1F1F5}\u{1F1FC}' },
    { code: 'ps', name: 'Palestine', flag: '\u{1F1F5}\u{1F1F8}' },
    { code: 'pa', name: 'Panam\u00E1', flag: '\u{1F1F5}\u{1F1E6}' },
    { code: 'pg', name: 'Papua New Guinea', flag: '\u{1F1F5}\u{1F1EC}' },
    { code: 'py', name: 'Paraguay', flag: '\u{1F1F5}\u{1F1FE}' },
    { code: 'pe', name: 'Per\u00FA', flag: '\u{1F1F5}\u{1F1EA}' },
    { code: 'ph', name: 'Philippines', flag: '\u{1F1F5}\u{1F1ED}' },
    { code: 'pl', name: 'Polska', flag: '\u{1F1F5}\u{1F1F1}' },
    { code: 'pt', name: 'Portugal', flag: '\u{1F1F5}\u{1F1F9}' },
    { code: 'qa', name: 'Qatar', flag: '\u{1F1F6}\u{1F1E6}' },
    { code: 'ro', name: 'Rom\u00E2nia', flag: '\u{1F1F7}\u{1F1F4}' },
    { code: 'ru', name: 'Russia', flag: '\u{1F1F7}\u{1F1FA}' },
    { code: 'rw', name: 'Rwanda', flag: '\u{1F1F7}\u{1F1FC}' },
    { code: 'kn', name: 'Saint Kitts and Nevis', flag: '\u{1F1F0}\u{1F1F3}' },
    { code: 'lc', name: 'Saint Lucia', flag: '\u{1F1F1}\u{1F1E8}' },
    { code: 'vc', name: 'Saint Vincent', flag: '\u{1F1FB}\u{1F1E8}' },
    { code: 'ws', name: 'Samoa', flag: '\u{1F1FC}\u{1F1F8}' },
    { code: 'sm', name: 'San Marino', flag: '\u{1F1F8}\u{1F1F2}' },
    { code: 'st', name: 'S\u00E3o Tom\u00E9 and Pr\u00EDncipe', flag: '\u{1F1F8}\u{1F1F9}' },
    { code: 'sa', name: 'Saudi Arabia', flag: '\u{1F1F8}\u{1F1E6}' },
    { code: 'sn', name: 'S\u00E9n\u00E9gal', flag: '\u{1F1F8}\u{1F1F3}' },
    { code: 'rs', name: 'Srbija', flag: '\u{1F1F7}\u{1F1F8}' },
    { code: 'sc', name: 'Seychelles', flag: '\u{1F1F8}\u{1F1E8}' },
    { code: 'sl', name: 'Sierra Leone', flag: '\u{1F1F8}\u{1F1F1}' },
    { code: 'sg', name: 'Singapore', flag: '\u{1F1F8}\u{1F1EC}' },
    { code: 'sk', name: 'Slovensko', flag: '\u{1F1F8}\u{1F1F0}' },
    { code: 'si', name: 'Slovenija', flag: '\u{1F1F8}\u{1F1EE}' },
    { code: 'sb', name: 'Solomon Islands', flag: '\u{1F1F8}\u{1F1E7}' },
    { code: 'so', name: 'Somalia', flag: '\u{1F1F8}\u{1F1F4}' },
    { code: 'za', name: 'South Africa', flag: '\u{1F1FF}\u{1F1E6}' },
    { code: 'ss', name: 'South Sudan', flag: '\u{1F1F8}\u{1F1F8}' },
    { code: 'es', name: 'Espa\u00F1a', flag: '\u{1F1EA}\u{1F1F8}' },
    { code: 'lk', name: 'Sri Lanka', flag: '\u{1F1F1}\u{1F1F0}' },
    { code: 'sd', name: 'Sudan', flag: '\u{1F1F8}\u{1F1E9}' },
    { code: 'sr', name: 'Suriname', flag: '\u{1F1F8}\u{1F1F7}' },
    { code: 'se', name: 'Sverige', flag: '\u{1F1F8}\u{1F1EA}' },
    { code: 'ch', name: 'Schweiz', flag: '\u{1F1E8}\u{1F1ED}' },
    { code: 'sy', name: 'Syria', flag: '\u{1F1F8}\u{1F1FE}' },
    { code: 'tw', name: 'Taiwan', flag: '\u{1F1F9}\u{1F1FC}' },
    { code: 'tj', name: 'Tajikistan', flag: '\u{1F1F9}\u{1F1EF}' },
    { code: 'tz', name: 'Tanzania', flag: '\u{1F1F9}\u{1F1FF}' },
    { code: 'th', name: 'Thailand', flag: '\u{1F1F9}\u{1F1ED}' },
    { code: 'tl', name: 'Timor-Leste', flag: '\u{1F1F9}\u{1F1F1}' },
    { code: 'tg', name: 'Togo', flag: '\u{1F1F9}\u{1F1EC}' },
    { code: 'to', name: 'Tonga', flag: '\u{1F1F9}\u{1F1F4}' },
    { code: 'tt', name: 'Trinidad and Tobago', flag: '\u{1F1F9}\u{1F1F9}' },
    { code: 'tn', name: 'Tunisia', flag: '\u{1F1F9}\u{1F1F3}' },
    { code: 'tr', name: 'T\u00FCrkiye', flag: '\u{1F1F9}\u{1F1F7}' },
    { code: 'tm', name: 'Turkmenistan', flag: '\u{1F1F9}\u{1F1F2}' },
    { code: 'tv', name: 'Tuvalu', flag: '\u{1F1F9}\u{1F1FB}' },
    { code: 'ug', name: 'Uganda', flag: '\u{1F1FA}\u{1F1EC}' },
    { code: 'ua', name: 'Ukraine', flag: '\u{1F1FA}\u{1F1E6}' },
    { code: 'ae', name: 'UAE', flag: '\u{1F1E6}\u{1F1EA}' },
    { code: 'gb', name: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}' },
    { code: 'us', name: 'United States', flag: '\u{1F1FA}\u{1F1F8}' },
    { code: 'uy', name: 'Uruguay', flag: '\u{1F1FA}\u{1F1FE}' },
    { code: 'uz', name: 'Uzbekistan', flag: '\u{1F1FA}\u{1F1FF}' },
    { code: 'vu', name: 'Vanuatu', flag: '\u{1F1FB}\u{1F1FA}' },
    { code: 'va', name: 'Vatican City', flag: '\u{1F1FB}\u{1F1E6}' },
    { code: 've', name: 'Venezuela', flag: '\u{1F1FB}\u{1F1EA}' },
    { code: 'vn', name: 'Vi\u1EC7t Nam', flag: '\u{1F1FB}\u{1F1F3}' },
    { code: 'ye', name: 'Yemen', flag: '\u{1F1FE}\u{1F1EA}' },
    { code: 'zm', name: 'Zambia', flag: '\u{1F1FF}\u{1F1F2}' },
    { code: 'zw', name: 'Zimbabwe', flag: '\u{1F1FF}\u{1F1FC}' },
];

/**
 * Document configurations for countries with known ID formats.
 * Countries not listed here will use the default flexible format.
 */
const DOCUMENT_CONFIGS = {
    // Latin America
    ar: { name: 'DNI', placeholder: '00.000.000', maxLength: 10 },
    bo: { name: 'CI', placeholder: '00000000', maxLength: 10 },
    br: { name: 'CPF', placeholder: '000.000.000-00', maxLength: 14 },
    cl: { name: 'RUT', placeholder: '00.000.000-X', maxLength: 12 },
    co: { name: 'CC', placeholder: '0000000000', maxLength: 12 },
    cr: { name: 'C\u00E9dula', placeholder: '0-0000-0000', maxLength: 11 },
    cu: { name: 'CI', placeholder: '00000000000', maxLength: 11 },
    do: { name: 'C\u00E9dula', placeholder: '000-0000000-0', maxLength: 13 },
    ec: { name: 'CI', placeholder: '0000000000', maxLength: 10 },
    gt: { name: 'DPI', placeholder: '0000 00000 0000', maxLength: 15 },
    hn: { name: 'DNI', placeholder: '0000-0000-00000', maxLength: 15 },
    mx: { name: 'CURP', placeholder: 'XXXX000000XXXXXX00', maxLength: 18 },
    ni: { name: 'C\u00E9dula', placeholder: '000-000000-0000X', maxLength: 16 },
    pa: { name: 'C\u00E9dula', placeholder: '0-000-0000', maxLength: 10 },
    pe: { name: 'DNI', placeholder: '00000000', maxLength: 8 },
    py: { name: 'CI', placeholder: '0.000.000', maxLength: 9 },
    sv: { name: 'DUI', placeholder: '00000000-0', maxLength: 10 },
    uy: { name: 'CI', placeholder: '0.000.000-0', maxLength: 11 },
    ve: { name: 'CI', placeholder: 'V-00000000', maxLength: 10 },

    // Europe
    at: { name: 'Personalausweis', placeholder: '000000000', maxLength: 9 },
    be: { name: 'eID', placeholder: '000-0000000-00', maxLength: 14 },
    ch: { name: 'AHV', placeholder: '756.0000.0000.00', maxLength: 16 },
    de: { name: 'Personalausweis', placeholder: 'XXXXXXXXX', maxLength: 9 },
    es: { name: 'DNI/NIE', placeholder: '00000000X', maxLength: 9 },
    fr: { name: 'CNI', placeholder: '000000000000', maxLength: 12 },
    gb: { name: 'NI Number', placeholder: 'XX 00 00 00 X', maxLength: 13 },
    it: { name: 'Codice Fiscale', placeholder: 'XXXXXX00X00X000X', maxLength: 16 },
    nl: { name: 'BSN', placeholder: '000000000', maxLength: 9 },
    pl: { name: 'PESEL', placeholder: '00000000000', maxLength: 11 },
    pt: { name: 'NIF', placeholder: '000000000', maxLength: 9 },
    ro: { name: 'CNP', placeholder: '0000000000000', maxLength: 13 },

    // North America
    ca: { name: 'SIN', placeholder: '000-000-000', maxLength: 11 },
    us: { name: 'SSN', placeholder: '000-00-0000', maxLength: 11 },

    // Asia & Oceania
    au: { name: 'TFN', placeholder: '000 000 000', maxLength: 11 },
    cn: { name: '\u8EAB\u4EFD\u8BC1', placeholder: '000000000000000000', maxLength: 18 },
    in: { name: 'Aadhaar', placeholder: '0000 0000 0000', maxLength: 14 },
    jp: { name: 'My Number', placeholder: '0000 0000 0000', maxLength: 14 },
    kr: { name: '\uC8FC\uBBFC\uB4F1\uB85D\uBC88\uD638', placeholder: '000000-0000000', maxLength: 14 },
    ph: { name: 'PhilID', placeholder: '0000-0000-0000-0000', maxLength: 19 },
    sg: { name: 'NRIC', placeholder: 'X0000000X', maxLength: 9 },

    // Africa & Middle East
    il: { name: 'Teudat Zehut', placeholder: '000000000', maxLength: 9 },
    ng: { name: 'NIN', placeholder: '00000000000', maxLength: 11 },
    za: { name: 'ID Number', placeholder: '0000000000000', maxLength: 13 },
};

/**
 * Phone format configurations for countries with known formats.
 */
const PHONE_CONFIGS = {
    // Latin America
    ar: { placeholder: '11 0000-0000', maxLength: 12 },
    bo: { placeholder: '7000 0000', maxLength: 9 },
    br: { placeholder: '(00) 00000-0000', maxLength: 15 },
    cl: { placeholder: '9 0000 0000', maxLength: 11 },
    co: { placeholder: '300 000 0000', maxLength: 12 },
    ec: { placeholder: '09 0000 0000', maxLength: 12 },
    mx: { placeholder: '55 0000 0000', maxLength: 12 },
    pe: { placeholder: '900 000 000', maxLength: 11 },
    py: { placeholder: '0981 000 000', maxLength: 12 },
    uy: { placeholder: '09 000 000', maxLength: 10 },
    ve: { placeholder: '0400-000-0000', maxLength: 13 },

    // Europe
    de: { placeholder: '0151 00000000', maxLength: 14 },
    es: { placeholder: '600 00 00 00', maxLength: 12 },
    fr: { placeholder: '06 00 00 00 00', maxLength: 14 },
    gb: { placeholder: '07000 000000', maxLength: 13 },
    it: { placeholder: '333 000 0000', maxLength: 12 },
    pt: { placeholder: '900 000 000', maxLength: 11 },

    // North America
    ca: { placeholder: '(000) 000-0000', maxLength: 14 },
    us: { placeholder: '(000) 000-0000', maxLength: 14 },

    // Asia & Oceania
    au: { placeholder: '0400 000 000', maxLength: 12 },
    cn: { placeholder: '138 0000 0000', maxLength: 13 },
    in: { placeholder: '98765 43210', maxLength: 12 },
    jp: { placeholder: '090-0000-0000', maxLength: 13 },
};

/**
 * Default configuration for countries without specific formats.
 */
const DEFAULT_CONFIG = {
    document: { name: 'ID', placeholder: '', maxLength: 30 },
    phone: { placeholder: '', maxLength: 20 }
};

/**
 * Get configuration for a specific country code.
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code
 * @returns {Object} Country configuration with document and phone settings
 */
export const getCountryConfig = (countryCode) => {
    if (!countryCode) {
        return DEFAULT_CONFIG;
    }

    const code = countryCode.toLowerCase();
    return {
        document: DOCUMENT_CONFIGS[code] || DEFAULT_CONFIG.document,
        phone: PHONE_CONFIGS[code] || DEFAULT_CONFIG.phone
    };
};

/**
 * Get the complete list of countries for dropdown selection.
 * Sorted alphabetically by name, with priority countries at the top.
 * @param {string[]} priorityCodes - Country codes to show at the top (e.g., ['br', 'us'])
 * @returns {Array} Sorted array of country objects
 */
export const getCountryList = (priorityCodes = ['br', 'co', 'ar', 'mx', 'cl', 'pe', 'es', 'us', 'pt']) => {
    const prioritySet = new Set(priorityCodes.map(c => c.toLowerCase()));

    const priorityCountries = [];
    const otherCountries = [];

    COUNTRIES.forEach(country => {
        if (prioritySet.has(country.code)) {
            priorityCountries.push(country);
        } else {
            otherCountries.push(country);
        }
    });

    // Sort priority countries by their order in the priorityCodes array
    priorityCountries.sort((a, b) => {
        return priorityCodes.indexOf(a.code) - priorityCodes.indexOf(b.code);
    });

    // Sort other countries alphabetically
    otherCountries.sort((a, b) => a.name.localeCompare(b.name));

    return [...priorityCountries, ...otherCountries];
};

/**
 * Find a country by its code.
 * @param {string} code - ISO 3166-1 alpha-2 country code
 * @returns {Object|null} Country object or null if not found
 */
export const getCountryByCode = (code) => {
    if (!code) return null;
    return COUNTRIES.find(c => c.code === code.toLowerCase()) || null;
};

/**
 * Input formatting functions for documents and phones.
 * These format the value as the user types.
 */

/**
 * Format Brazilian CPF: 000.000.000-00
 */
const formatCPF = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

/**
 * Format Brazilian phone: (00) 00000-0000
 */
const formatBrazilianPhone = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits.length ? `(${digits}` : '';
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

/**
 * Format Argentine DNI: 00.000.000
 */
const formatArgentineDNI = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
};

/**
 * Format Chilean RUT: 00.000.000-X
 */
const formatChileanRUT = (value) => {
    const clean = value.replace(/[^0-9kK]/g, '').slice(0, 9);
    if (clean.length <= 2) return clean;
    if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`;
    if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}-${clean.slice(8).toUpperCase()}`;
};

/**
 * Format US/Canada phone: (000) 000-0000
 */
const formatNorthAmericanPhone = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits.length ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

/**
 * Document formatters by country code
 */
const DOCUMENT_FORMATTERS = {
    br: formatCPF,
    ar: formatArgentineDNI,
    cl: formatChileanRUT,
};

/**
 * Phone formatters by country code
 */
const PHONE_FORMATTERS = {
    br: formatBrazilianPhone,
    us: formatNorthAmericanPhone,
    ca: formatNorthAmericanPhone,
};

/**
 * Format a document ID based on the country code.
 * @param {string} value - The raw input value
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code
 * @returns {string} Formatted value
 */
export const formatDocument = (value, countryCode) => {
    if (!value) return '';
    const code = countryCode?.toLowerCase();
    const formatter = DOCUMENT_FORMATTERS[code];
    return formatter ? formatter(value) : value;
};

/**
 * Format a phone number based on the country code.
 * @param {string} value - The raw input value
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code
 * @returns {string} Formatted value
 */
export const formatPhone = (value, countryCode) => {
    if (!value) return '';
    const code = countryCode?.toLowerCase();
    const formatter = PHONE_FORMATTERS[code];
    return formatter ? formatter(value) : value;
};
