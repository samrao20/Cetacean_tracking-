/**
 * Koamas sighting submission endpoint.
 * Install in Extensions > Apps Script for the reporting spreadsheet.
 * Configure the Drive folder ID below, then deploy as a Web app:
 * Execute as: Me; Who has access: Anyone.
 *
 * SECURITY: the public web-app URL accepts anonymous submissions. Keep
 * photo size/type validation enabled, monitor abuse, and restrict folder
 * sharing to the project team. Do not make uploaded images public.
 */
const SPREADSHEET_ID = '1DItcBIstn-K_4A0Yji09e-Bpmz7h9Agp2KlFJcxOpao';
const SHEET_NAME = 'Website';
const DRIVE_FOLDER_ID = '1l0e7SnrRnfKP5ulGwkG8tVAxxX75I9B-';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const HEADERS = ['Atoll/Location', 'Coordinates', 'Date', 'Time (MT)', 'Species', 'Pod Size Estimate', 'Verified (yes/no)', 'Photo (yes/no)', 'Observer', 'Notes', 'Photo URL'];

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 8 * 1024 * 1024) throw new Error('Invalid or oversized request.');
    const data = JSON.parse(raw);
    if (data.website) throw new Error('Invalid submission.');
    const required = ['date', 'time', 'atollLocation', 'coordinates', 'species', 'podSize', 'observer', 'photoData', 'photoName', 'photoMimeType'];
    required.forEach(function (key) { if (!String(data[key] || '').trim()) throw new Error('Missing required field: ' + key); });
    if (!ALLOWED_MIME_TYPES.includes(data.photoMimeType)) throw new Error('Unsupported photo type.');

    const encoded = String(data.photoData).replace(/^data:image\/(?:jpeg|png|webp);base64,/, '');
    const bytes = Utilities.base64Decode(encoded);
    if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new Error('Photo must be 5 MB or smaller.');

    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const safeName = String(data.photoName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'sighting-photo';
    const timestamp = Utilities.formatDate(new Date(), 'Indian/Maldives', 'yyyyMMdd-HHmmss');
    const file = folder.createFile(Utilities.newBlob(bytes, data.photoMimeType, timestamp + '-' + safeName));
    // Leave Drive permissions inherited/private; do not make wildlife photos public.

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet tab not found: ' + SHEET_NAME);
    const currentLastColumn = Math.max(sheet.getLastColumn(), HEADERS.length);
    let headers = sheet.getRange(1, 1, 1, currentLastColumn).getDisplayValues()[0].map(function (v) { return String(v).trim(); });
    if (headers.every(function (v) { return !v; })) {
      headers = HEADERS.slice();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else if (headers.indexOf('Photo URL') === -1) {
      headers.push('Photo URL');
      sheet.getRange(1, headers.length).setValue('Photo URL');
    }

    const rowByHeader = {
      'Atoll/Location': cleanCell(data.atollLocation),
      'Coordinates': cleanCell(data.coordinates),
      'Date': cleanCell(data.date),
      'Time (MT)': cleanCell(data.time),
      'Species': cleanCell(data.species),
      'Pod Size Estimate': cleanCell(data.podSize),
      'Verified (yes/no)': 'no',
      'Photo (yes/no)': 'yes',
      'Observer': cleanCell(data.observer),
      'Notes': cleanCell(data.notes || ''),
      'Photo URL': file.getUrl()
    };
    const row = headers.map(function (header) { return Object.prototype.hasOwnProperty.call(rowByHeader, header) ? rowByHeader[header] : ''; });
    sheet.appendRow(row);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Submission could not be saved.' })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Prevent user-entered values beginning with formula operators from running
// as spreadsheet formulas. Values are still readable as text in the sheet.
function cleanCell(value) {
  const text = String(value == null ? '' : value).slice(0, 2000);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
