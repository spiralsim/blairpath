var canvas, images = {
	floors: [],
	site: null,
};

// Loads maps
function preload () {
	const MAP_PATH = "/maps";
	for (let i = 1; i <= 4; i++) images.floors.push(loadImage(`${MAP_PATH}/f${i}.png`));
	images.site = loadImage(`${MAP_PATH}/site.png`);
}

function getCanvasDivWidth() {
	return document.getElementById('canvas').getBoundingClientRect().width;
}

function inCanvas () {
	return mouseX > 0;
}

// Compute distance between a point (px, py) and segment (ax, ay) -- (bx, by)
// Adapted from https://stackoverflow.com/questions/849211/shortest-distance-between-a-point-and-a-line-segment
function distToLine ({ x: px, y: py }, { x: ax, y: ay }, { x: bx, y: by }) {
	var l = pow(dist(ax, ay, bx, by), 2);
	if (l == 0) return pow(dist(px, py, ax, ay), 2);
	var t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l;
	t = max(0, min(1, t));
	return dist(px, py, ax + t * (bx - ax), ay + t * (by - ay));
}

var loaded = false;

/*
	Navigation
*/
const DEFAULT_ZOOM = 0.9, SCROLL_ZOOM_RATE = 1.01;
const MIN_ZOOM = 0.3, MAX_ZOOM = 10;
// All positions are given as pixel coordinates

var mouseHasMoved = false;
function mouseMoved() {
	mouseHasMoved = true;
}

/*
	Physical position = Location on the canvas, in px
	Virtual position = Location that the cursor corresponds to on the floor
	plan's original image (at original scale, meaning 1 px on the image = 1 px
	on the screen)
 */
const VIEW = {
	// Canvas position of the floor plan's top-left corner
	offset: null,
	scale: null,
	floor: 1,
	rulerInM: 100,
	get hoverRadius() {
		return EDGE_WIDTH / this.scale;
	},
	get vertexDiameter() {
		return this.hoverRadius * 3;
	},
	pan(delta) {
		VIEW.offset.add(delta);
	},
	panArrow(xDirection, yDirection) {
		const INCREMENT = 10;
		this.pan(createVector(xDirection, yDirection).mult(INCREMENT));
	},
	rulerInPixels() {
		return VIEW.rulerInM / CONSTANTS.M_PER_PIXEL * VIEW.scale;
	},
	calibrateRuler() {
		// Note that we must have
		// MAX_RULER_LENGTH_IN_PIXELS / MIN_RULER_LENGTH_IN_PIXELS > 5/2
		// because consecutive increments are separated by a factor up to 5/2
		const MIN_RULER_LENGTH_IN_PIXELS = 40;
		const MAX_RULER_LENGTH_IN_PIXELS = 120;
		function firstDigit() {
			return String(VIEW.rulerInM)[0];
		}
		// 1 -> 2 -> 5 -> 10
		function increment() {
			if (firstDigit() == '2') VIEW.rulerInM *= 5 / 2;
			else VIEW.rulerInM *= 2;
		}
		// 10 -> 5 -> 2 -> 1
		function decrement() {
			if (firstDigit() == '5') VIEW.rulerInM /= 5 / 2;
			else VIEW.rulerInM /= 2;
		}
		while (VIEW.rulerInPixels() < MIN_RULER_LENGTH_IN_PIXELS) increment();
		while (VIEW.rulerInPixels() > MAX_RULER_LENGTH_IN_PIXELS) decrement();
	},
	applyZoom(scaleFactor, center = createVector(width / 2, height / 2)) {
		var nextZoom = VIEW.scale * scaleFactor;
		if (nextZoom < MIN_ZOOM || nextZoom > MAX_ZOOM)
			return;

		VIEW.offset = p5.Vector.add(
			center, p5.Vector.sub(VIEW.offset, center).mult(scaleFactor)
		);
		VIEW.scale *= scaleFactor;
		VIEW.calibrateRuler();
	},
	zoomIn() {
		this.applyZoom(1.2);
	},
	zoomOut() {
		this.applyZoom(0.8);
	},
	reset() {
		VIEW.scale = DEFAULT_ZOOM;
		const CANVAS_CENTER = createVector(width / 2, height / 2);
		const IMAGE_0 = images.floors[0];
		const FLOOR_SIZE_VECTOR = createVector(IMAGE_0.width, IMAGE_0.height);
		VIEW.offset = CANVAS_CENTER.sub(
			p5.Vector.mult(FLOOR_SIZE_VECTOR, VIEW.scale / 2)
		);
		VIEW.calibrateRuler();
	}
};

const CURSOR = {
	get canvasXY() {
		return createVector(mouseX, mouseY);
	},
	get virtualXY() {
		return p5.Vector.sub(CURSOR.canvasXY, VIEW.offset).div(VIEW.scale);
	},
	get fxy() {
		return fxy(VIEW.floor, this.virtualXY.x, this.virtualXY.y);
	},
	get virtualXYArray() {
		return this.virtualXY.array().slice(0, 2).map(coord => round(coord));
	}
};

var showOptions = {
	'show-site-plan': null,
	'show-floor-plan': null,
	'show-labels': null,
};
for (let option in showOptions) {
	const checkbox = document.querySelector(`#${option}`);
	function updateOption() {
		showOptions[option] = checkbox.checked;
	}
	updateOption();
	checkbox.addEventListener('change', updateOption);
}

// What the cursor is displayed as (changes between ARROW, HAND, and MOVE)
var cursorType;

var hoveredObject = null;
var activeObject = null;
var activePortables = new Set();
function blairpathObjectType(object) {
	if (!object)
		return null;
	else if (Array.isArray(object)) 
		return "edge";
	else
		return vertexType(object);
}

/**
 * When a vertex's FXY changes, any edge(s) with that FXY as an endpoint must
 * also update that FXY. If the vertex is deleted, the edge(s) must be deleted.
 * 
 * @param {} vertex The original vertex to move
 * @param {} changefn A function to be applied to the vertex to change the
 * vertex (optionally, change its FXY). To delete, set the **argument** to null.
 */
function changeAndPropagateVertex(vertex, changefn) {
	const oldVertex = structuredClone(vertex);
	const oldFXYstring = FXYtoString(vertex.fxy);

	const edgesWithVertex = Array.from(memoryData.edges)
		.filter(e => edgeToString(e).includes(oldFXYstring));

	if (changefn == null) {
		edgesWithVertex.forEach(e => memoryData.edges.delete(e));
		memoryData.vertices.delete(vertex);
		return;
	}

	changefn(vertex);
	const newFXYstring = FXYtoString(vertex.fxy);
	if (oldFXYstring == newFXYstring)
		return;

	delete stringToVertex[oldFXYstring];
	stringToVertex[newFXYstring] = vertex;
	edgesWithVertex.forEach(e => {
		for (let i = 0; i < 2; i++)
			if (FXYtoString(e[i]) == oldFXYstring)
				e[i] = vertex.fxy;
	});
}
function transformActivePortables(changefn) {
	getPlaceInputs()
		.filter(isPortable)
		.forEach(id => changeAndPropagateVertex(idToPlace[id], changefn));
}

function isVisibleBorder(edge) {
	return edgeType(edge) == "border" && VIEW.floor == 1;
}
function isPathEdge(object) {
	if (blairpathObjectType(object) != "edge")
		return false;
	return edgesOnPath.has(edgeToString(object));
}

function blairpathObjectColor(object) {
	var colorUsed = isPathEdge(object) ? color(0, 128, 255) : color(0);
	if (object == activeObject)
		colorUsed = color(0, 192, 0);
	if (object == hoveredObject)
		colorUsed = lerpColor(colorUsed, color(255), 0.75);
	stroke(colorUsed);
	fill(colorUsed);
}

function refreshHoveredObject() {
	hoveredObject = null;
	if (!showingDevTools)
		return;
	const verticesArray = Array.from(memoryData.vertices);
	for (let i = 0; i < verticesArray.length; i++) {
		const v = verticesArray[i];
		const fxy = v.fxy;
		if (fxy.floor != VIEW.floor)
			continue;
		const radius = VIEW.vertexDiameter / 2;
		if (dist(...CURSOR.virtualXYArray, fxy.x, fxy.y) < radius) {
			hoveredObject = v;
			return;
		}
	}
	const edgesArray = Array.from(memoryData.edges);
	for (let i = 0; i < edgesArray.length; i++) {
		const e = edgesArray[i];
		if (!e.some(fxy => fxy.floor == VIEW.floor))
			continue;
		if (edgeType(e) == "temporary")
			continue;
		if (distToLine(CURSOR.virtualXY, ...e) < VIEW.hoverRadius) {
			hoveredObject = e;
			return;
		}
	}
}

const LABEL_FONT_SIZE = 14;

/*
	p5.js Event Functions
*/
var lastWidth, lastHeight;
function setup() {
	canvas = createCanvas(getCanvasDivWidth(), windowHeight);
	lastWidth = width, lastHeight = height;
	canvas.parent("canvas");

	textFont('Roboto');

	VIEW.reset();
	mouseDragged();
};

function windowResized() {
	resizeCanvas(getCanvasDivWidth(), windowHeight);
	VIEW.pan(createVector(width - lastWidth, height - lastHeight).div(2));
	lastWidth = width, lastHeight = height;
}

var dataLastCopied = null;
function keyPressed() {
	if (key == 't')
		toggleDevTools();
	else if (key == 'c') {
		copyNextDiskData();
		dataLastCopied = new Date();
	} else if (key == '=' || key == '+')
		VIEW.zoomIn();
	else if (key == '-' || key == '_')
		VIEW.zoomOut();

	if (!showingDevTools)
		return;

	const activeType = blairpathObjectType(activeObject);
	if (key == 'p' || key == 'b') {
		activeObject = {
			fxy: CURSOR.fxy,
			section: key == 'p' ? "path" : "border"
		};
		memoryData.vertices.add(activeObject);
		stringToVertex[FXYtoString(CURSOR.fxy)] = activeObject;
	} else if (key == 's') {
		if (activeType == "border")
			activeObject.section = "path";
		else if (activeType == "path")
			activeObject.section = "border";
	} else if (key == '[')
		transformActivePortables(p => p.angle--);
	else if (key == ']')
		transformActivePortables(p => p.angle++);
	else if (key == 'a')
		transformActivePortables(p => p.fxy.x--);
	else if (key == 'd')
		transformActivePortables(p => p.fxy.x++);
	else if (key == 'w')
		transformActivePortables(p => p.fxy.y--);
	else if (key == 's')
		transformActivePortables(p => p.fxy.y++);
	else if (keyCode == BACKSPACE || keyCode == DELETE) {
		if (activeType == "edge")
			memoryData.edges.delete(activeObject);
		else
			changeAndPropagateVertex(activeObject, null);
		activeObject = null;
	}
	refreshTemporaryEdges();
};

function mousePressed() {
	if (hoveredObject == null)
		return;
	if (hoveredObject == activeObject) {
		activeObject = null;
		return;
	}
	const hoveredType = blairpathObjectType(hoveredObject);
	const activeType = blairpathObjectType(activeObject);
	if (hoveredType != "edge") {
		if (hoveredType == "place")
			addPlaceToTable(hoveredObject.id);
		else if (hoveredType == activeType) {
			const newEdge = [activeObject.fxy, hoveredObject.fxy];
			const s = edgeToString(newEdge);
			var isDuplicate = false;
			memoryData.edges.forEach(e => {
				if (edgeToString(e) == s || edgeToString(e.reverse()) == s)
					isDuplicate = true;
			});
			if (!isDuplicate)
				memoryData.edges.add([activeObject.fxy, hoveredObject.fxy]);
			else
				activeObject = hoveredObject;
		}
		refreshTemporaryEdges();
	}
	if (hoveredType != "place")
		activeObject = hoveredObject;
};

function mouseDragged() {
	if (!inCanvas()) return;
	cursorType = MOVE;
	VIEW.pan(createVector(movedX, movedY));
};

var allTouches = [];
function touchMoved() {
	allTouches.push(touches.map(t => `${t.x},${t.y}`).join(';'));
}

function mouseWheel({ delta }) {
	if (!inCanvas()) return;
	VIEW.applyZoom(SCROLL_ZOOM_RATE ** -delta, CURSOR.canvasXY); // Uses negative sign to conform to Google Maps' zoom
};

const EDGE_WIDTH = 4;
/**
 * Draws an edge (segment, dotted, or arrow).
 * 
 * @param {} edge
 */
function drawEdge(e) {
	/**
	 * Draws an arrow representing the vertical edge between `a` and `b`, pointing
	 * in the direction of the endpoint not on the current floor.
	 * @param {Vertex} a Vertex at the arrow's start point
	 * @param {Vertex} b Vertex at the arrow's end point
	 */
	function drawArrow(a, b) {
		const dir = a.floor == VIEW.floor ? b.floor - VIEW.floor : a.floor - VIEW.floor;
		triangle(
			a.x - 5 / VIEW.scale, a.y,
			a.x + 5 / VIEW.scale, a.y,
			a.x, a.y - dir * 10 / VIEW.scale,
		);
	}

	/**
	 * Draws a dotted line from point a to b.
	 * @param {Vertex} a First endpoint.
	 * @param {Vertex} b Second endpoint.
	 */
	function drawDottedEdge(a, b) {
		const length = dist(a.x, a.y, b.x, b.y);
		for (let i = 0; i < length; i += 5 / VIEW.scale)
			point(lerp(a.x, b.x, i / length), lerp(a.y, b.y, i / length));
	}

	blairpathObjectColor(e);

	var strokeWeightBeforeZoom = EDGE_WIDTH;
	if (edgeType(e) == "border")
		strokeWeightBeforeZoom /= 2;
	strokeWeight(strokeWeightBeforeZoom / VIEW.scale);

	const a = e[0], b = e[1];
	if (a.floor == b.floor) {
		if (edgeType(e) == "temporary") drawDottedEdge(a, b);
		else line(a.x, a.y, b.x, b.y);
	} else drawArrow(a, b);
}

function showSitePlan() {
	const OFFSET = CONSTANTS["SITE_PLAN_OFFSET_IN_PIXELS"];
	image(images.site, ...OFFSET);
	if (!showingDevTools) return;
	strokeWeight(EDGE_WIDTH / VIEW.scale);
	stroke(0, 0, 255);
	rect(...OFFSET, images.site.width, images.site.height);
}

function showEdges() {
	memoryData.edges.forEach(e => {
		if (!e.map(fxy => fxy.floor).includes(VIEW.floor))
			return;

		if (!isPathEdge(e) && !showingDevTools && !isVisibleBorder(e))
			return;

		drawEdge(e);
	});
}

function isPortable(id) {
	return /^P[0-9]+$/.test(id);
}
function showFloorPlan() {
	function showPortables() {
		stroke(0);
		fill(204, 30, 30);
		strokeWeight(2 / VIEW.scale);
		rectMode(CENTER);
		angleMode(DEGREES);
		Object.values(idToPlace).forEach(place => {
			if (!isPortable(place.id) || place.fxy.floor != VIEW.floor)
				return;
			push();
			translate(place.fxy.x, place.fxy.y);
			rotate(place.angle ?? 0);
			rect(
				0,
				0,
				CONSTANTS.PORTABLE_LENGTH_IN_PIXELS,
				CONSTANTS.PORTABLE_WIDTH_IN_PIXELS
			);
			pop();
		});
		rectMode(CORNERS);
	}
	image(images.floors[VIEW.floor - 1], 0, 0);
	showPortables();
	showEdges();
	if (showingDevTools) {
		strokeWeight(EDGE_WIDTH / VIEW.scale);
		stroke(255, 0, 0);
		noFill();
		rect(0, 0, images.floors[0].width, images.floors[0].height);
	}
}

function showLabels() {
	textAlign(CENTER, CENTER);
	const labelTextSize = 14 / VIEW.scale;
	textSize(labelTextSize);
	strokeWeight(2 / VIEW.scale);
	const placeValuesSet = new Set(getPlaceInputs());
	// Display dots for room selection
	for (let id in idToPlace) {
		const place = idToPlace[id], fxy = place.fxy;
		if (fxy.floor != VIEW.floor) continue;
		// Display the point and detect hovering if applicable
		const nameWidth = textWidth(id);
		if (
			abs(CURSOR.virtualXY.x - fxy.x) < nameWidth / 2 &&
			abs(CURSOR.virtualXY.y - fxy.y) < labelTextSize / 2 &&
			!hoveredObject
		) {
			hoveredObject = place;
			cursorType = HAND;
		}

		if (placeValuesSet.has(id)) {
			stroke(255);
			fill(0);
		} else {
			stroke(0);
			fill(place == hoveredObject ? 128 : 255);
		}
		text(id, fxy.x, fxy.y);

		stroke(0);
		fill(255);
		if (showingDevTools) {
			var parenthesizedText = FXYtoString(fxy);
			if (place.angle != undefined)
				parenthesizedText += ` ${place.angle}°`;
			text(`(${parenthesizedText})`, fxy.x, fxy.y + labelTextSize);
		}
	}
}

var showingDevTools = false;
function toggleDevTools() {
	showingDevTools = !showingDevTools;
	document.getElementById('outputDiv').hidden = !showingDevTools;
}

function showVertices() {
	noFill();
	strokeWeight(2 / VIEW.scale);
	memoryData.vertices.forEach(v => {
		if (v.fxy.floor != VIEW.floor)
			return;
		if (vertexType(v) == "place")
			return;
		blairpathObjectColor(v);
		noFill();
		rectMode(CENTER);
		const shapeFunction = vertexType(v) == "path" ? circle : square;
		shapeFunction(v.fxy.x, v.fxy.y, VIEW.vertexDiameter);
	});
}

function showDevStats() {
	function localeFullString(date) {
		const d = new Date(date)
		return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
	}

	var stats = [];
	stats.push(`Disk last updated: ${localeFullString(memoryData.timestamp)}`);
	if (dataLastCopied != null)
		stats.push(`Data last copied: ${localeFullString(dataLastCopied)}`);
	stats.push(`Vertices: ${memoryData.vertices.size}`);
	stats.push(`Edges: ${memoryData.edges.size}`);
	if (mouseHasMoved)
		stats.push(`FXY: ${FXYtoString(CURSOR.fxy)}`);
	if (blairpathObjectType(hoveredObject) == "edge")
		stats.push(`Edge length: ${round(lengthInM(hoveredObject), 2)} m`);
	if (allTouches.length)
		stats.push(allTouches.join(' '));
	const statsText = stats.join('\n');

	const statsY = height - stats.length * 24;
	fill(255);
	rect(0, statsY, textWidth(statsText) + 10, height);

	noStroke();
	fill(0);
	textAlign(LEFT, TOP);
	text(statsText, 5, statsY + 6);
}

function showTooltip() {
	if (blairpathObjectType(hoveredObject) != "place")
		return;

	textSize(LABEL_FONT_SIZE);

	var topText = hoveredObject.id;
	if (hoveredObject.use && !topText.includes(hoveredObject.use))
		topText += ` (${hoveredObject.use})`;

	var bottomText = hoveredObject.section;

	const labelX = VIEW.offset.x + hoveredObject.fxy.x * VIEW.scale;
	const labelY = VIEW.offset.y + hoveredObject.fxy.y * VIEW.scale;
	const maxW = max(textWidth(topText), textWidth(bottomText));
	const
		tooltipW = maxW + LABEL_FONT_SIZE,
		tooltipH = 30,
		tooltipX = constrain(labelX, tooltipW / 2, width - tooltipW / 2),
		tooltipY = labelY + tooltipH * (labelY < height / 2 ? -1 : 1);

	strokeWeight(1);
	fill(255);
	rectMode(CENTER);
	rect(tooltipX, tooltipY, tooltipW, tooltipH, LABEL_FONT_SIZE / 2);
	fill(0);
	textAlign(CENTER, CENTER);
	noStroke();
	textStyle(BOLD);
	text(topText, tooltipX, tooltipY - LABEL_FONT_SIZE / 2);
	textStyle(NORMAL);
	text(bottomText, tooltipX, tooltipY + LABEL_FONT_SIZE / 2);
}

function showRuler() {
	var rulerLeftX = width - VIEW.rulerInPixels() - 22;

	textSize(18);
	rectMode(CORNER);

	const rulerText = `${VIEW.rulerInM} m`;

	var rulerTextLeftX = rulerLeftX - 5 - textWidth(rulerText);

	fill(255);
	rect(rulerTextLeftX - 5, height - 20, width, 20);

	noStroke();
	fill(0);
	rect(rulerLeftX, height - 15, 2, 10);
	rect(rulerLeftX, height - 7, VIEW.rulerInPixels(), 2);
	rect(rulerLeftX + VIEW.rulerInPixels() - 2, height - 15, 2, 10);
	textAlign(LEFT, CENTER);
	text(rulerText, rulerTextLeftX, height - 10);
}

function draw() {
	// Remove loading message
	if (!loaded && tableLoaded && memoryData != null) {
		document.getElementById("map-placeholder").remove();
		loaded = true;
	}

	if (!loaded)
		return;

	refreshPathQuery();

	background(255);

	// Map Display
	push();
	translate(VIEW.offset);
	scale(VIEW.scale);

	// images
	noFill();
	imageMode(CORNER);

	refreshHoveredObject();
	if (showOptions[`show-site-plan`]) showSitePlan();
	if (showOptions[`show-floor-plan`]) showFloorPlan();
	showEdges();
	if (showingDevTools) showVertices();
	if (showOptions[`show-labels`]) showLabels();

	pop();

	// Cursor
	cursor(cursorType);
	cursorType = ARROW;

	showTooltip();

	showRuler();
	if (showingDevTools) showDevStats();

	if (keyIsDown(LEFT_ARROW))
		VIEW.panArrow(1, 0);
	else if (keyIsDown(RIGHT_ARROW))
		VIEW.panArrow(-1, 0);
	else if (keyIsDown(UP_ARROW))
		VIEW.panArrow(0, 1);
	else if (keyIsDown(DOWN_ARROW))
		VIEW.panArrow(0, -1);
};
