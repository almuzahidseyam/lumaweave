# Privacy and permissions

LumaWeave processes camera frames and optional clap audio locally. The model files and WebAssembly runtime are bundled with the extension. The extension has no analytics, account system, remote model loader or application backend. Tracking landmarks and person masks are passed between the Meet page and an extension iframe in memory, rather than stored.

**The processed camera feed is returned to Google Meet.** Meet sends it to other participants under its normal behavior. Meeting recordings, Google's service, the Meet page itself and other browser extensions are outside LumaWeave's control. Local inference does not mean a Google Meet call works without the internet or that its video never leaves the PC.

The extension declares only `storage` and runs its content scripts only at `https://meet.google.com/*`. It wraps Meet's existing camera requests. It does not request a new microphone in the preview, secretly open a separate microphone or upload recordings. Sound clap detection is off by default; when enabled it analyzes a clone of Meet's existing mic track, respects its `enabled`/`muted` state and releases the clone when the camera engine stops. Meet's own microphone track remains owned by Meet.

Preferences are stored in `chrome.storage.local`. A first run can copy legacy `storage.sync` preferences if no local settings exist. Subsequent writes stay local; historical preferences already synced by the older extension are not deleted automatically. Exported JSON contains effect preferences, not video/audio. Files are chosen explicitly when importing; exports use an ordinary browser download.

The main-world video hook necessarily shares its execution environment with Meet. The page can observe/modify that code and same-page messages; the bridge is not a security boundary against a compromised Meet page. The detector checks parent origin, source window and per-instance channel/request IDs. These checks reject unrelated frames and stale replies; they do not hide the camera from the website that requested it.

Camera-off teardown releases the tracker iframe, active audio analyzer and pipeline resources after the last camera consumer stops. A page navigation also tears down the engine. Uninstalling the extension clears its local extension preferences. Public source and bundled model provenance are documented in `THIRD_PARTY_NOTICES.md`.
