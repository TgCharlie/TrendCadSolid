# TrendCad Solid — version 0.2

A local, 2D-only CAD drawing workspace for solid surface manufacturing. The browser version remains offline-first; the desktop build adds Windows/macOS installers and a GitHub Releases update check.

## Desktop installers and updates

The public source repository is [TgCharlie/TrendCadSolid](https://github.com/TgCharlie/TrendCadSolid). GitHub Actions builds a Windows `.exe` installer and macOS `.dmg` installers when a version tag such as `v0.2.0` is pushed. The workflow publishes those artifacts to a GitHub Release.

To build locally with Node.js 22 or newer:

```text
npm ci
npm run desktop       # run the Electron desktop app
npm run dist:win      # build the Windows NSIS installer
npm run dist:mac      # build the macOS DMG installer (run on macOS)
```

In the desktop app, **Check for updates** queries the repository's latest public GitHub Release. If a newer release exists, the button changes to **Download v…** and opens the release page so the correct installer can be downloaded. The check is deliberately release-based: pushing source code alone does not publish an installer.

To publish a release, update `version` in `package.json`, commit the change, and push a matching tag:

```text
git tag v0.2.1
git push origin main --tags
```

GitHub Actions then builds both platform installers and attaches them to the release.

## Open the tool

Double-click **Start TrendCad.cmd** to start the local server and open TrendCad in your browser. The launcher uses Windows PowerShell's built-in TCP server, so Node.js and Python are not required. Keep the JavaScript, CSS and `node_modules` files alongside the HTML file. Opening **index.html** directly still works for drawing and DXF files, but DWG conversion requires the local server because browsers block WebAssembly module loading from `file://` pages.

## First drawing

1. Click **Rectangle**, **Circle**, **Line** or **Polyline** in the top drawing toolbar. Editing tools are in the left rail.
2. Click points on the canvas, or use **Precision drawing** on the right for exact rectangle, circle and line dimensions.
3. Choose **Arc** (or type `ARC`) and click centre, start, then end. You can enter the radius after selecting the centre.
4. Select an object's edge to inspect it. Shift-click adds/removes objects from a selection. The inspector edits coordinates, radii, arc angles, layers and polyline vertices.
5. Use **Move** with a base point and destination, or enter exact X/Y offsets. Duplicate creates a copy offset by the current grid spacing.
6. **Save** downloads a native `.trendcad` project containing the drawing, layers, sheet settings/layouts and print-page work. **Open** restores that project later. **Export DXF** downloads machining geometry for CNC/CAD exchange. **Import DXF / DWG** replaces the current drawing, with a warning if changes have not been saved. DWG files are converted locally to ASCII DXF in the browser, so the source drawing is not uploaded.

All working dimensions are **millimetres**, with Y increasing upward. **Grid snap (F9)** toggles rounding to the entered spacing. **Object snap** independently toggles snapping to endpoints, vertices, circle centres and perpendicular projections; these take priority over grid snap. Turn off Grid snap, Object snap, Snap extend and Ortho for completely unconstrained points. The **Grid** checkbox only controls grid visibility. Ortho constrains new line/polyline segments and movement horizontally or vertically.

Hold **Shift** while drawing a line or polyline to snap the angle. The default increment is **10°**, including 0°, 90° and 170°. Change **Shift angle snap (degrees)** in the right panel for another increment, such as 45°. Release Shift to return to normal drawing. Angle constraints take priority over grid/object snap and Ortho.

### Parts tool

Choose **Parts** (or type `PART`, `PARTS` or `ISLAND`), then click inside an island. The tool selects the smallest boundary containing the click and creates a new fully closed polyline that follows it. Existing lines, arcs, circles and polylines are retained. Small endpoint gaps are automatically bridged, duplicate/tiny/collinear geometry is cleaned up, and segmented circular edges are fitted back to true-radius bulged polyline arcs. New geometry is yellow on the `Parts` layer, and the tool stays active for repeated clicks. Change **Parts gap cleanup (mm)** under **User preferences**; the default is 5 mm.

For typed sizes, choose Line, Circle or Rectangle and click the first point (centre for a circle). Start typing to enter the size in the command line, or use the Precision drawing panel. Enter a line **length and angle**, circle **diameter**, or rectangle **width and height**, then press Enter or click **Create shape**. The clicked point is used as the origin. Exact values are not rounded to the grid.

### Dimensions

Choose **Dimension (D)**, click two measured points, then click to place the measurement line. Horizontal, vertical and diagonal distances display in millimetres with extension lines and arrowheads. Select the annotation to edit its endpoints or offset; move, duplicate, delete and undo work as for other objects.

The Dimension tool also has **Diameter Ø** and **Radius R** modes in the Measurement dropdown. Select a circle, arc, or curved polyline segment, then click to place the annotation. Diameter measures the full underlying circle diameter, even when selected from an arc. The label uses **Ø** or **R** and millimetres. `DIMDIAMETER` and `DIMRADIUS` start these modes from the command line. Annotations are independent snapshots: changing the part does not automatically update existing dimensions.

Aligned, diameter and radial dimension entities and their display blocks are preserved in DXF export/import. Radial formats follow Autodesk's [radial and diameter DXF specification](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-165A992D-9017-4C1E-B8CC-E70A17191BFE.htm). External CAD/CAM rendering has not yet been validated.

### Command line

With the canvas or a tool button active, **start typing**. Focus transfers automatically to the command line at the bottom; no input-box click is needed. **Enter** accepts a value; right-click also accepts pending command text. Escape cancels the current command. Normal typing inside a sidebar input is unaffected.

- **Line / polyline:** pick the starting point, point the mouse in the direction to draw, type `500`, then Enter. The exact length follows that direction, including active angle constraints. Alternatively enter `500<90` for a length and angle, or `@100,50` for a relative displacement. A polyline adds a vertex; a line creates one segment.
- **Offset:** type `25`, Enter, then select the source and click the desired side. The distance can also be changed after selecting the source.
- **Circle:** click the centre, type the **diameter**, Enter.
- **Rectangle:** click the first corner, type `600,400` (or `600x400`), Enter. You can also type width, Enter, then height, Enter. The rectangle extends toward the pointer's quadrant.
- **Commands:** type `LINE`, `OFFSET`, `TRIM`, `EXTEND`, `FILLET`, `RADIUS`, `CIRCLE`, `RECTANGLE`, `POLYLINE`, `PART`, `PARTS`, `ISLAND`, `DIMENSION`, `DIMRADIUS`, `DIMDIAMETER`, `MOVE`, `SELECT`, `UNDO`, `REDO`, `ERASE` or `FIT`, then Enter. Single-letter tool aliases now require Enter. `CLOSE` or `FINISH` completes a polyline. Empty Enter in Select repeats the last tool.

### Selection box, fillet and radius editing

Selection/editing tools use a **20-pixel square pick box** instead of the crosshair. Put any portion of an edge within the box and click; the closest eligible edge is chosen. Drawing tools retain the crosshair. The pick box also works at its corners, and dimensions can be selected without becoming edit boundaries.

**Fillet:** enter a radius (direct typing is supported), select the first straight edge, then the second. Two separate straight lines are trimmed to tangent points and joined by an exact circular arc. Adjacent straight segments of the same polyline are rounded in-place with a bulged segment, preserving closure. Click on the sides of standalone lines that should remain. Repeated corners of a polyline can be filleted while the selected edges remain straight. Parallel edges, oversized radii, tangencies outside the existing lines, and intersections with other edges of that polyline are rejected. Fillet does not yet join line-to-arc or arc-to-arc pairs or edges belonging to different polylines.

**Radius:** select a circle, arc or rounded polyline segment, type its new radius, Enter (or use Apply radius). A fillet with straight tangent lines keeps its virtual corner: its centre and tangent points are recalculated and both attached lines are trimmed/extended together, as one undoable edit. This also works for rounded corners inside a polyline. Select-mode direct numeric entry works for a single selected circle/arc or a clicked curved polyline segment. Changing only an arc's radius in the inspector uses the same tangent-preserving edit. Plain circles and unattached arcs retain their centres. Ambiguous connections, non-tangent joins, curved adjoining edges and oversized radii are rejected rather than disconnected. **Radius dimension** measures and annotates geometry without changing it.

### Marquee selection, grouping and explode

In **Select**, press and drag to draw a marquee. These directions follow the workshop preference in this project:

- **Left → right:** dashed green marquee selects geometry it touches or contains.
- **Right → left:** solid blue marquee selects only fully enclosed geometry.
- Selection previews during the drag. Selected objects turn **bright cyan**. Shift-click toggles an object/group; Shift-marquee adds to the current selection. Escape cancels a marquee. Clicking blank space clears selection.

**Group** (or `GROUP` / `G`, Enter; Ctrl+G) combines two or more selected objects into a selection unit. Selecting one member selects all members. Move, duplicate and delete act on the selected group. Duplicates get independent group identities. A crossing marquee can touch any member to select the whole group; an enclosure marquee must contain every member. Edge drag bars are hidden for grouped geometry; ungroup before stretching individual edges.

**Ungroup** (`UNGROUP`, Enter; Ctrl+Shift+G) releases the selection unit without changing geometry. **Explode** (`EXPLODE` / `X`, Enter) releases groups one level at a time; on an ungrouped polyline it creates separate lines and exact arcs, preserving the layer and curve radii. Lines, circles, arcs and dimensions remain unchanged. All three operations support undo/redo and are available in the right-click menu.

TrendCad grouping survives its own DXF export/import using registered `TRENDCAD_GROUP` extended data, following Autodesk's [DXF extended-data format](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-A2A628B0-3699-4740-A215-C560E7242F63.htm). Other CAD applications receive ordinary geometry and may ignore or remove this grouping metadata; it is not a native AutoCAD GROUP object.

Dimensions are independent annotations, not linked to the part: remeasure after editing the part. They export as DXF DIMENSION entities with display blocks on the **DIMENSIONS** layer, and can be imported again. Keep this annotation layer out of machining operations. Angular, ordinate and rotated-linear dimension types remain unsupported. Text is rounded to two decimal places for display; measured endpoints retain their precision. The export follows Autodesk's [aligned dimension specification](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-7A123D5D-AC98-4A9A-A8CF-1A7EF5030418.htm); external CAD/CAM rendering has not yet been validated.

Pan with middle-button drag or Space + left drag. Zoom with the mouse wheel. Hold right-click on a selected object and scroll to rotate it by the active rotation snap in any view. **Fit drawing** shows all objects. Use Enter to finish an open polyline, Shift + Enter to close it, and Escape to cancel. Ctrl+Z/Y undo/redo; Ctrl+A selects all; Delete removes the selection; Ctrl+S saves a native `.trendcad` project.

## Editing tools and mouse controls

- **Offset (O):** enter the distance, click a source edge, then click the side for the copy. A dashed preview shows the result. Supports lines, circles, arcs, open straight-sided polylines and convex closed straight-sided polylines. Curved/concave closed polyline offsets are not supported. Collapsed or self-intersecting results are rejected.
- **Trim (T):** click a cutting boundary, then click the portion of the target to remove. Only actual boundary intersections are used. Keep clicking targets or choose another boundary in the panel.
- **Extend (E):** click a boundary, then click near the target endpoint to extend. The nearest forward intersection with the finite boundary is used. Supports lines, arcs and the outer end segments of open polylines. Closed contours have no endpoints to extend.
- Trimming or extending a polyline separates it into independent lines/arcs, preserving unedited segments and layers. Dimensions are excluded as boundaries and targets. All edits support undo/redo.
- **Right-click:** while drawing, commits a complete preview or finishes a polyline through its already-clicked vertices. With an offset source selected, commits the preview; after a left-click offset, it just finishes the command. With Trim/Extend active, finishes the command. When idle, opens the tool menu, including Repeat last command. Escape cancels incomplete work.
- **Snap extend:** independently toggle the status-bar checkbox to track horizontal/vertical alignment with existing endpoints, vertices, circle centres/quadrants and vertices in the polyline being drawn. Within 8 screen pixels, the cursor snaps to the node's X or Y coordinate, with a dashed guide and a small reference-node marker. Shift angle/Ortho constraints take priority. For completely free coordinates turn off Grid snap, Object snap, Snap extend and Ortho.
- **Yellow drag bars:** in Select mode, select a line or straight-sided polyline. Drag an edge's yellow midpoint bar perpendicular to the edge; adjoining straight segments stay connected. Horizontal edges move vertically, vertical edges move horizontally, and diagonal edges move along their perpendicular. Grid snap rounds the movement distance to the current spacing. Release to apply as one undo step; Escape cancels. Curved polylines do not show these bars. Moves that collapse/reverse edges, create crossings, or require a join with parallel adjoining segments are rejected.

## DXF support details

- Imports ASCII DXF model-space LINE, CIRCLE, ARC, LWPOLYLINE, aligned/radial/diameter DIMENSION and legacy 2D POLYLINE/VERTEX entities.
- Keeps layer names, open/closed contours and bulge values for curved polyline segments. Arcs remain exact curves in exported DXF; canvas display uses sampled curves.
- Converts declared DXF units to millimetres. Files without `$INSUNITS` are assumed to be millimetres and show a notice; check dimensions after import.
- Exports ASCII DXF AC1015 (AutoCAD 2000), using millimetres and lightweight polylines.
- Reports unsupported entities such as INSERT/block references, SPLINE, ELLIPSE, hatches, paper-space objects and non-planar geometry. TEXT and MTEXT are imported as editable annotations; complex alignment, width scaling and rich MTEXT formatting are normalized to TrendCad's baseline-left text model. Partial imports require acknowledgement. Explode blocks and convert unsupported curves to supported 2D geometry in the source CAD program first.
- Polyline widths are not retained. Colours, line styles, block definitions, annotations and other source metadata are not preserved. DWG import uses the bundled `dwgdxf` WebAssembly converter for supported AutoCAD DWG versions, then passes the converted ASCII DXF through the same 2D importer; unsupported entities are reported as before. Import limit: 30 MB.

This release prepares geometry only. It does not create CNC toolpaths, G-code, nesting, cutter compensation, lead-ins or machine-specific output. Machine/CAM compatibility has not yet been validated. Check dimensions, closed contours and the result in your plant's CAM software before manufacturing.

The **Open sample drawing** button and **examples/sample-worktop.dxf** contain a 2400 × 600 mm example worktop with three cutouts, for trying import and editing.

## Development

The DWG converter is bundled locally. With Node.js installed:

```text
node --test tests/cad-core.test.js tests/cad-edit.test.js tests/cad-command.test.js tests/cad-selection.test.js
node server.cjs
```

The optional development server listens on `http://127.0.0.1:4173`. The application also works directly from `index.html`. Geometry and DXF functions are in `cad-core.js`; interaction and canvas rendering are in `app.js`.

Command suggestions appear as you type: `tr` suggests TRIM; Enter starts the displayed command. Up/Down cycles alternatives, or click the suggestion. Numeric distances remain unchanged.

To resize a rounded polyline corner, choose Radius, click the curved segment away from its endpoints, type the radius and press Enter. No explode is required.

Right-button drag on a selected object moves the selection. Hold Shift when releasing to duplicate instead; originals stay in place. A short right-click opens the tool menu. Escape cancels the current operation and clears all selection.

`JOIN` (or `J`) groups the selected objects, exactly like `GROUP`; it does not merge their geometry.

Trim: select any number of cutting-edge objects, then right-click (or Enter) to start trimming. Press Enter without selecting boundaries to use all drawing edges, including adjoining segments in the target polyline. Click the portion between intersections to remove it; right-click finishes. Choose another boundary restarts boundary selection.

Node grips: in Select mode, select a shape and drag a square endpoint/vertex. Endpoints at the same position move together, including attached lines, polylines and arcs. Other vertices stay fixed. Grid and endpoint snapping apply. Release commits one undo step; Escape cancels. Curved segments retain their sweep/bulge and remain connected, but this free node edit does not constrain tangency or radius. Use Radius for tangent-preserving fillet resizing.

Click the Snap extend title in the bottom bar to open object snap settings: Endpoint, Midpoint, Center, Quadrant, Nearest and Perpendicular. These modes use the Object snap master checkbox. Endpoint, Midpoint, Center and Quadrant take priority over Perpendicular whenever they are within the snap tolerance, including horizontal segments. Perpendicular projects the cursor to the nearest finite line or curve normal on visible geometry from the current starting node; after the cursor passes that special target, Nearest resumes automatically. The separate Snap extend checkbox still controls horizontal/vertical alignment tracking. Exact snap points take priority over Nearest within the cursor tolerance. Modes also apply when dragging nodes.

Trim/Extend hover previews: after choosing boundaries, hover over a valid target. Trim shows the portion to remove in yellow dashes; Extend shows the target segment and its proposed extension in yellow dashes. Click to commit. Invalid targets have no preview; hovering never changes geometry or Undo history.

Extend uses the same boundary-selection workflow as Trim: select multiple boundary objects and right-click (or Enter) to begin, or press Enter with none selected to use all drawing edges. Click near the endpoint to extend to the nearest forward intersection with a finite boundary. Dashed hover previews show the result. Right-click finishes; Choose another boundary restarts selection.

Text: choose Text in the top toolbar (or type TEXT / DT), drag out a box and release to set its size. Type directly into the focused box. New text starts at 18 screen pixels at the current zoom and keeps that size as you type. Enter adds a new line; Ctrl+Enter (or Command+Enter) or a click outside commits it; Escape cancels without adding geometry. Select placed text to change its wording, position, height, rotation or layer in Drawing properties. Text supports move, duplicate, group, marquee selection, delete and Undo. Single-line labels export as DXF TEXT and multiline labels as MTEXT on the TEXT layer. Imported TEXT/MTEXT is editable and preserves common DXF colours; complex alignment, mirroring, oblique or width scaling is normalized to baseline-left text and reported. Rendering uses a simple monospace font; font appearance may vary in other CAD software. Text is annotation, not outlined CNC cutting geometry.

Move grips: in Select mode, hover over a text insertion node or circle center to highlight its move grip. Drag and release, or click the grip then click a destination. This moves the whole object (or its group). Shift copies; Escape cancels; Undo restores the move. Line and polyline vertex grips retain their connected-node stretch behavior.

Double-click placed text (including its insertion grip) to reopen the inline multiline editor. Ctrl+Enter or clicking outside updates that same text object while retaining its position, size, rotation, layer and group. Escape discards the pending edits. Saving is one Undo step; saving unchanged text adds no history entry.

Text formatting: the bar above the editor provides whole-box Bold, Colour and Size (millimetres). List toggles bullets on selected lines or the current line. Enter continues a bullet list; Enter on an empty bullet ends it. Formatting remains editable after reopening and survives DXF export/import. Ctrl+Enter or clicking outside saves; Escape discards pending formatting.
Drawing colours: use the swatches or custom colour picker in the top drawing toolbar. In Select mode, colours apply to selected objects or groups as one Undo step. Otherwise, the colour applies to new geometry. Selection highlighting stays cyan. DXF true-colour values preserve object colours.

Layers: create and select an active layer in the Layers panel. New geometry uses it. Move selection to layer assigns selected objects/groups, and Layer colour updates the layer's objects. Show layer toggles the active layer's visibility; Show all layers restores every layer. Hidden objects are excluded from picking, snapping and marquee selection, but remain in the model and DXF export. Layer visibility is a workspace setting.
Sheet layout: enter material width, height, margin and part spacing; Show / fit sheet displays the reference rectangle. Group each part's outline with its cutouts before selecting parts and using Arrange selected in rows. Packing starts at the top-left usable corner of the first sheet, matching the material layout view. With Allow automatic 90° rotation enabled, each part is tested at 0° and 90° and the orientation that keeps it in the current row or fits the sheet is chosen. If the current sheet has no remaining placement, another sheet is created below it and packing continues. Parts stay rigid, retain colours/layers, and are packed in rows; this is not automatic nesting. Disable rotation when grain direction or a fixed orientation matters. Invalid or oversized arrangements are rejected without partial changes. Ctrl+Z undoes the layout. The sheet references are never exported.
While Show sheet is active, Sheet Layout is placement-only: parts can be selected, moved, rotated and copied, but their nodes, drag bars and geometry-edit commands are disabled. The left edit rail remains visible for a consistent three-view layout; only Select, Move and Duplicate stay enabled in Sheet Layout. Dragging a selected part directly with the left mouse button, with Move, or with the right-button move gesture snaps its bounds to the sheet margin and the configured part spacing; collision checking prevents overlap and redirects a blocked move to the nearest clear position. Add additional stock sizes/offcuts in the Sheet Layout panel and set a quantity for each; the arranger uses the available sizes and creates only the sheets it needs. Parts outside a sheet boundary render red. The compact Sheet Layout panel provides automatic rotation and a rotation-snap increment (90°, 45° or 15°); right-button scrolling rotates the held part around its bounds centre as one undoable edit. Turn off Snap when free placement is needed. The Drawing board, Sheet layout and Print page tabs keep each workspace focused on its relevant controls.
Print page: use the Print page tab to open an in-workbench print workspace with the same left tool rail, top drawing tools and command line. The right panel controls A4/A3 paper, orientation, page scale, title, scalable viewports and PDF output. Select a viewport on the paper to edit its position, size or scale; each of its four corner nodes can be dragged independently to resize it, with a highlighted crosshair when a corner is selectable. Add viewport creates additional views of the selected workbench parts. Right-clicking inside a viewport opens a viewport-only menu for selecting, locking/unlocking, creating, panning, scaling, fitting or deleting viewports; middle-drag pans unlocked content and the wheel scales it. Lines, arcs, rectangles, circles, polylines, dimensions and multiline text placed here are temporary print annotations and never alter the manufacturing drawing or DXF. The header Print layout action remains available for the standalone print window when a selected snapshot is preferred.
Keyboard: C closes an active polyline to its first vertex (requires three vertices). Ctrl+C copies selected drawing objects, Ctrl+V starts a paste preview, and a click places it. Escape cancels a paste. Grouped copies receive independent group identities. Copy/paste in text inputs retains normal text editing behavior.
