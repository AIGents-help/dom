# Photo and finding review

This replaces the existing inspection callout, not a demonstration page. The saved
photo occupies the main pane; review decisions and the client note sit beside it.
The narrow layout stacks both panes inside a bounded native modal dialog.

The current image can be enlarged up to 3x and its recorded region toggled. A linked
previous image retains the existing manual overlay/alignment controls, now under
comparison controls. The overlay does not establish measured change or defect
accuracy. Images are loaded through the existing authenticated, owner-scoped report
endpoint; no new storage access or external provider is introduced.

Confirm and Dismiss use the existing atomic review endpoint. Both require a loaded
source image and no unsaved note. Saving a note preserves the existing inclusion
choice and detector metadata. The report link is unavailable while a draft is
unsaved. Closing or Escape with changes offers Keep editing or Discard unsaved note.
A failed save keeps the local draft. Drafts are not persisted across a browser crash
or loss of the enclosing workspace. A background parent refresh that closes the
review on access loss is still governed by the existing evidence hook.

The interface does not claim a save until the server returns success. The note
endpoint additionally requires its saved:true acknowledgement. Reports are checked
for the requested inspection and finding before their images are rendered.

Local checks: node --test scripts/photo-review.node-test.mjs. The browser walkthrough
in e2e/photo-review.test.mjs is restricted to a disposable loopback environment and
uses saved synthetic records and the repository's generated demonstration image.
It covers zoom, region display, comparison alignment, note persistence, interrupted
saves, close protection, report content, actual confirm/dismiss writes, missing
photos, rejected mismatched responses and phone layout. Full CI and screenshots
must be inspected before release; synthetic fixtures do not validate real aircraft
or detector accuracy. The rest of the evidence list is unchanged in this increment.
