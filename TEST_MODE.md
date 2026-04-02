# Test Mode: Temporary Server Uploads

This deployment is in test mode while outbound HTTPS to OwnCloud/WebDAV is blocked.

## Behavior
- The UI shows a "TEST MODE" banner.
- "Add Local Videos" uploads to the server disk using `POST /api/videos/upload`.
- Videos are stored under `data/videos` on this VM.

## Switch Back To OwnCloud/WebDAV
1. Set WebDAV env vars in .env:
   - `WEBDAV_BASE_URL`
   - `WEBDAV_USERNAME`
   - `WEBDAV_PASSWORD`
   - Optional: `WEBDAV_BASE_FOLDER`
2. Restart the backend service.
3. The banner should disappear and uploads will use `POST /api/uploads`.

## Notes
- This is a temporary fallback; do not rely on VM disk for long-term storage.
