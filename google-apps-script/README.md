# Sighting form deployment

The standalone form is `sighting-form.html`. It creates an independent MapLibre map using the same ocean basemap and center as `map.html`; it has no sightings source and cannot change the public sightings map.

## Connect Google Sheets and Drive

1. Open the reporting spreadsheet and confirm its target tab is named `Website`.
2. In **Extensions → Apps Script**, replace the current project code with `google-apps-script/Code.gs` from this repository.
3. The script is configured for the supplied spreadsheet ID and Drive folder ID. Review those constants and confirm the script owner has edit access to both.
4. Save, then **Deploy → Manage deployments → Edit** the existing Web app deployment and select **New version**. Keep **Execute as: Me** and **Who has access: Anyone** so public visitors can submit. The web app URL used by the page is already configured.
5. Add the extra `Photo URL` column to row 1 in the `Website` tab if desired; the script adds it when absent. Existing columns may stay in their current order. Keep the Drive folder private/shared only with the project team; the script stores a Drive URL without changing sharing permissions.
6. Test with a small image and verify the row and Drive file appear. Remove the test row/file afterward if it is not a real sighting.

## Important

- Until the Apps Script code is replaced and redeployed, the existing `/exec` endpoint may not accept this form's payload.
- Browser requests to Apps Script use `no-cors`, so the form cannot read a success/error response. A browser network completion is not proof that the row was saved; verify the first test in the sheet.
- The Apps Script URL is a public, anonymous write endpoint. The script validates required fields and photo size/type, but those checks are not a full anti-spam or authentication system. Monitor submissions and rotate/restrict the deployment if it is abused.
- Uploaded photos inherit the Drive folder's existing permissions; do not set the folder to public unless public access is explicitly intended.
- The form is directly available at `/sighting-form.html`. The existing `submit.html` informational page has not been replaced, so link to this form from that page/navigation when ready.
