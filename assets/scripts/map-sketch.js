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
const DEFAULT_ZOOM = 1, SCROLL_ZOOM_RATE = 1.01;
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
	// Physical position of the floor plan's top-left corner
	physPos: null,
	zoom: null,
	floor: 1,
	rulerInMeters: 100,
	get hoverRadius() {
		return EDGE_WIDTH / this.zoom;
	},
	get vertexDiameter() {
		return this.hoverRadius * 3;
	},
	pan(delta) {
		VIEW.physPos.add(delta);
	},
	rulerInPixels() {
		return VIEW.rulerInMeters / memoryData.constants.METERS_PER_PIXEL * VIEW.zoom;
	},
	calibrateRuler() {
		// Note that we must have
		// MAX_RULER_LENGTH_IN_PIXELS / MIN_RULER_LENGTH_IN_PIXELS > 5/2
		// because consecutive increments are separated by a factor up to 5/2
		const MIN_RULER_LENGTH_IN_PIXELS = 40;
		const MAX_RULER_LENGTH_IN_PIXELS = 120;
		function firstDigit() {
			return String(VIEW.rulerInMeters)[0];
		}
		// 1 -> 2 -> 5 -> 10
		function increment() {
			if (firstDigit() == '2') VIEW.rulerInMeters *= 5 / 2;
			else VIEW.rulerInMeters *= 2;
		}
		// 10 -> 5 -> 2 -> 1
		function decrement() {
			if (firstDigit() == '5') VIEW.rulerInMeters /= 5 / 2;
			else VIEW.rulerInMeters /= 2;
		}
		while (VIEW.rulerInPixels() < MIN_RULER_LENGTH_IN_PIXELS) increment();
		while (VIEW.rulerInPixels() > MAX_RULER_LENGTH_IN_PIXELS) decrement();
	},
	applyZoom(scaleFactor, center = createVector(width / 2, height / 2)) {
		var nextZoom = VIEW.zoom * scaleFactor;
		if (nextZoom < MIN_ZOOM || nextZoom > MAX_ZOOM)
			return;

		VIEW.physPos = p5.Vector.add(
			center, p5.Vector.sub(VIEW.physPos, center).mult(scaleFactor)
		);
		VIEW.zoom *= scaleFactor;
		VIEW.calibrateRuler();
	},
	reset() {
		VIEW.zoom = DEFAULT_ZOOM;
		const CANVAS_CENTER = createVector(width / 2, height / 2);
		const IMAGE_0 = images.floors[0];
		const FLOOR_SIZE_VECTOR = createVector(IMAGE_0.width, IMAGE_0.height);
		VIEW.physPos = CANVAS_CENTER.sub(
			p5.Vector.mult(FLOOR_SIZE_VECTOR, VIEW.zoom / 2)
		);
		VIEW.calibrateRuler();
	}
};

const CURSOR = {
	get canvasXY() {
		return createVector(mouseX, mouseY);
	},
	get virtualXY() {
		return p5.Vector.sub(CURSOR.canvasXY, VIEW.physPos).div(VIEW.zoom);
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
function blairpathObjectType(object) {
	if (!object)
		return null;
	else if (Array.isArray(object)) 
		return "edge";
	else
		return vertexType(object);
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
function setup() {
	canvas = createCanvas(getCanvasDivWidth(), windowHeight);
	canvas.parent("canvas");

	textFont('Roboto');

	VIEW.reset();
	mouseDragged();
};

function windowResized() {
	resizeCanvas(getCanvasDivWidth(), windowHeight);
}

function keyPressed() {
	if (!showingDevTools) return;
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
	} else if (keyCode == BACKSPACE) {
		if (activeType == "edge")
			memoryData.edges.delete(activeObject);
		else {
			const fxyString = FXYtoString(activeObject.fxy);
			memoryData.edges.forEach(e => {
				if (edgeToString(e).includes(fxyString))
					memoryData.edges.delete(e);
			});
			memoryData.vertices.delete(activeObject);
			delete stringToVertex[fxyString];
		}
		activeObject = null;
	}
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
		if (hoveredType == "place") {
			// Handle edge case where there are no rows to begin with
			if (!rows.length) addPlaceInput();
			// Find the number of the first empty point input
			for (let i = 1; i <= rows.length; i++) {
				if (!getPointValue(i)) {
					setPointValue(i, hoveredObject.id);
					return;
				}
			}
			addPlaceInput();
			setPointValue(rows.length, hoveredObject.id);
		} else if (hoveredType == activeType) {
			console.log(activeObject);
			console.log(hoveredObject);
			memoryData.edges.add([activeObject.fxy, hoveredObject.fxy]);
		}
	}
	if (hoveredType != "place")
		activeObject = hoveredObject;
};

function mouseDragged() {
	if (!inCanvas()) return;
	cursorType = MOVE;
	VIEW.pan(createVector(movedX, movedY));
};

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
			a.x - 5 / VIEW.zoom, a.y,
			a.x + 5 / VIEW.zoom, a.y,
			a.x, a.y - dir * 10 / VIEW.zoom,
		);
	}

	/**
	 * Draws a dotted line from point a to b.
	 * @param {Vertex} a First endpoint.
	 * @param {Vertex} b Second endpoint.
	 */
	function drawDottedEdge(a, b) {
		const length = dist(a.x, a.y, b.x, b.y);
		for (let i = 0; i < length; i += 5 / VIEW.zoom)
			point(lerp(a.x, b.x, i / length), lerp(a.y, b.y, i / length));
	}

	blairpathObjectColor(e);

	var strokeWeightBeforeZoom = EDGE_WIDTH;
	if (edgeType(e) == "border")
		strokeWeightBeforeZoom /= 2;
	strokeWeight(strokeWeightBeforeZoom / VIEW.zoom);

	const a = e[0], b = e[1];
	if (a.floor == b.floor) {
		if (edgeType(e) == "temporary") drawDottedEdge(a, b);
		else line(a.x, a.y, b.x, b.y);
	} else drawArrow(a, b);
}

function showSitePlan() {
	const OFFSET = memoryData.constants["SITE_PLAN_OFFSET_IN_PIXELS"];
	image(images.site, ...OFFSET);
	if (!showingDevTools) return;
	strokeWeight(EDGE_WIDTH / VIEW.zoom);
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

function showFloorPlan() {
	function showPortables() {
		stroke(0);
		fill(204, 30, 30);
		strokeWeight(2 / VIEW.zoom);
		rectMode(CENTER);
		angleMode(DEGREES);
		Object.values(idToPlace).forEach(place => {
			const isPortable = /^P[0-9]+$/.test(place.id);
			if (!isPortable || place.fxy.floor != VIEW.floor)
				return;
			push();
			translate(place.fxy.x, place.fxy.y);
			rotate(place.angle ?? 0);
			rect(
				0,
				0,
				memoryData.constants.PORTABLE_LENGTH_IN_PIXELS,
				memoryData.constants.PORTABLE_WIDTH_IN_PIXELS
			);
			pop();
		});
		rectMode(CORNERS);
	}
	image(images.floors[VIEW.floor - 1], 0, 0);
	showPortables();
	showEdges();
	if (showingDevTools) {
		strokeWeight(EDGE_WIDTH / VIEW.zoom);
		stroke(255, 0, 0);
		noFill();
		rect(0, 0, images.floors[0].width, images.floors[0].height);
	}
}

function showLabels() {
	textAlign(CENTER, CENTER);
	textSize(14 / VIEW.zoom);
	strokeWeight(2 / VIEW.zoom);
	const placeValuesSet = new Set(getPlaceInputs());
	// Display dots for room selection
	for (let id in idToPlace) {
		const place = idToPlace[id], fxy = place.fxy;
		if (fxy.floor != VIEW.floor) continue;
		// Display the point and detect hovering if applicable
		const nameWidth = textWidth(id);
		if (
			abs(CURSOR.virtualXY.x - fxy.x) < nameWidth / 2 &&
			abs(CURSOR.virtualXY.y - fxy.y) < 6 / VIEW.zoom &&
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
	}
}

var showingDevTools = false;
function toggleDevTools() {
	showingDevTools = !showingDevTools;
	document.getElementById('outputDiv').hidden = !showingDevTools;
}

function showVertices() {
	noFill();
	strokeWeight(2 / VIEW.zoom);
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

function showTooltip() {
	if (blairpathObjectType(hoveredObject) != "place")
		return;

	textSize(LABEL_FONT_SIZE);

	var topText = hoveredObject.id;
	if (hoveredObject.use && !topText.includes(hoveredObject.use))
		topText += ` (${hoveredObject.use})`;

	var bottomText = hoveredObject.section;

	const labelX = VIEW.physPos.x + hoveredObject.fxy.x * VIEW.zoom;
	const labelY = VIEW.physPos.y + hoveredObject.fxy.y * VIEW.zoom;
	const maxW = max(textWidth(topText), textWidth(bottomText));
	const
		tooltipW = maxW + LABEL_FONT_SIZE,
		tooltipH = 30,
		tooltipX = constrain(labelX, tooltipW / 2, width - tooltipW / 2),
		tooltipY = labelY + tooltipH * (labelY < height / 2 ? -1 : 1);

	strokeWeight(1);
	fill(255, 255, 255, 230);
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

	var rulerText = `${VIEW.rulerInMeters} m`;
	if (showingDevTools) {
		rulerText = `Edges: ${memoryData.edges.size}\t` + rulerText;
		rulerText = `Vertices: ${memoryData.vertices.size}\t` + rulerText;
		if (mouseHasMoved)
			rulerText = `FXY: ${FXYtoString(CURSOR.fxy)}\t` + rulerText;
	}
	var rulerTextLeftX = rulerLeftX - 5 - textWidth(rulerText);

	fill(255, 192);
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
	if (!loaded) {
		document.getElementById("map-placeholder").remove();
		loaded = true;
	}

	if (tableLoaded) refreshPointTable();

	background(255);

	// Map Display
	push();
	translate(VIEW.physPos);
	scale(VIEW.zoom);

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
};
