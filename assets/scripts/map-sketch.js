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
/**
 * 
 * @param {{x, y}} endpoint1 
 * @param {{x, y}} endpoint2 
 * @returns bool
 */
function edgeIsHovered([endpoint1, endpoint2]) {
	return distToLine(CURSOR.virtualXY, endpoint1, endpoint2) < VIEW.hoverRadius;
}

var loaded = false, lastFrameRate = 60, lastUpdate = framesSinceUpdate = 0;

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
		function increment() {
			if (String(VIEW.rulerInMeters)[0] == '2') VIEW.rulerInMeters *= 5 / 2;
			// Includes 1 -> 2 and 5 -> 10
			else VIEW.rulerInMeters *= 2;
		}
		function decrement() {
			if (String(VIEW.rulerInMeters)[0] == '5') VIEW.rulerInMeters /= 5 / 2;
			// Includes 1 -> 0.5 and 2 -> 1
			else VIEW.rulerInMeters /= 2;
		}
		while (VIEW.rulerInPixels() < MIN_RULER_LENGTH_IN_PIXELS) increment();
		while (VIEW.rulerInPixels() > MAX_RULER_LENGTH_IN_PIXELS) decrement();
	},
	applyZoom(scaleFactor, center = createVector(width / 2, height / 2)) {
		var nextZoom = VIEW.zoom * scaleFactor;
		// console.log(nextZoom);
		if (nextZoom < MIN_ZOOM || nextZoom > MAX_ZOOM) {
			console.log(nextRulerInMeters);
			return;
		}

		VIEW.physPos = p5.Vector.add(
			center, p5.Vector.sub(VIEW.physPos, center).mult(scaleFactor)
		);
		VIEW.zoom *= scaleFactor;
		VIEW.calibrateRuler();
	},
	reset() {
		VIEW.zoom = DEFAULT_ZOOM;
		const CANVAS_CENTER = createVector(width / 2, height / 2);
		const FLOOR_SIZE_VECTOR = createVector(images.floors[0].width, images.floors[0].height);
		VIEW.physPos = CANVAS_CENTER.sub(p5.Vector.mult(FLOOR_SIZE_VECTOR, VIEW.zoom / 2));
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
	get FXY() {
		return FXY(VIEW.floor, this.virtualXY.x, this.virtualXY.y);
	},
	get virtPosArray2D() {
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

var ruler;

// What the cursor is displayed as (changes between ARROW, HAND, and MOVE)
var cursorType;
var hoveredPlace;

const LABEL_FONT_SIZE = 14;
const ACTIVE_COLOR = [0, 192, 0];

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

var hoveredVertex = null, activeVertex = null;
var activeEdge = null;

var hoveredEdge = null;
function keyPressed() {
	if (!showingDevTools) return;
};

function mousePressed() {
	if (hoveredPlace) {
		// Handle edge case where there are no rows to begin with
		if (!rows.length) addPlaceInput();
		// Find the number of the first empty point input
		for (let i = 1; i <= rows.length; i++) {
			if (!getPointValue(i)) {
				setPointValue(i, hoveredPlace.id);
				return;
			}
		}
		addPlaceInput();
		setPointValue(rows.length, hoveredPlace.id);
	}

	if (hoveredVertex) {
		activeVertex = hoveredVertex != activeVertex ? hoveredVertex : null;
		return;
	}
	if (activeVertex) {
		const newVertex = {
			floor: VIEW.floor,
			x: CURSOR.virtPosArray2D[0],
			y: CURSOR.virtPosArray2D[1]
		};
		const newEdge = {endpoint1: activeVertex, endpoint2: newVertex};
		memoryData.edges.push(newEdge);
		activeVertex = newVertex;
		activeEdge = newEdge;
		return;
	}
	if (hoveredEdge) {
		activeEdge = hoveredEdge;
		return;
	}
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
 * @param {p5.Color} _color
 */
function drawEdge(e, _color) {
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

	stroke(_color);
	fill(_color);

	var originalStrokeWeight = EDGE_WIDTH;
	if (edgeType(e) == 'border')
		originalStrokeWeight /= 2;
	strokeWeight(originalStrokeWeight / VIEW.zoom);

	const a = e[0], b = e[1];
	if (a.floor == b.floor) {
		if (edgeType(e) == 'temporary') drawDottedEdge(a, b);
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
	hoveredEdge = null;
	memoryData.edges.forEach(e => {
		if (!e.map(endpoint => endpoint.floor).includes(VIEW.floor))
			return;
		
		const isVisibleBorder = edgeType(e) == 'border' && VIEW.floor == 1;

		const onPath = edgesOnPath.has(edgeToString(e));
		if (!onPath && !showingDevTools && !isVisibleBorder)
			return;

		var edge_color = onPath ? color(0, 128, 255) : color(0);
		if (showingDevTools) {
			if (edgeIsHovered(e)) {
				edge_color = lerpColor(edge_color, color(255), 0.75);
				hoveredEdge = e;
			}
		}
		if (e == activeEdge) edge_color = ACTIVE_COLOR;
		drawEdge(e, edge_color);
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
	const pointValuesSet = new Set(getPlaceInputs());
	// Display dots for room selection
	for (let id in idToPlace) {
		const place = idToPlace[id], fxy = place.fxy;
		if (fxy.floor != VIEW.floor) continue;
		// Display the point and detect hovering if applicable
		const nameWidth = textWidth(id);
		if (
			abs(CURSOR.virtualXY.x - fxy.x) < nameWidth / 2 &&
			abs(CURSOR.virtualXY.y - fxy.y) < 6 / VIEW.zoom &&
			!hoveredPlace
		) {
			hoveredPlace = place;
			cursorType = HAND;
		}

		if (pointValuesSet.has(id)) {
			stroke(255);
			fill(0);
		} else {
			stroke(0);
			fill(place == hoveredPlace ? 128 : 255);
		}
		text(id, fxy.x, fxy.y);
	}
}

var showingDevTools = true;
function toggleDevTools() {
	if (activeBorder) deleteActiveBorder();
	showingDevTools = !showingDevTools;
	document.getElementById('outputDiv').hidden = !showingDevTools;
}
function showDevTools() {
	noFill();
	strokeWeight(2 / VIEW.zoom);
	hoveredVertex = null;
	memoryData.edges.forEach(e => {
		const eType = edgeType(e);
		if (eType == 'temporary') return;
		e.forEach(pos => {
			if (pos.floor != VIEW.floor) return;
			const diameter = EDGE_WIDTH * 3 / VIEW.zoom;
			var strokeColor = color(0);
			if (pos == activeVertex) strokeColor = color(0, 192, 0);
			if (dist(...CURSOR.virtPosArray2D, pos.x, pos.y) < diameter / 2) {
				hoveredVertex = pos;
				strokeColor = lerpColor(strokeColor, color(255), 0.75);
			}
			stroke(strokeColor);
			if (eType == 'path') circle(pos.x, pos.y, diameter);
			else if (eType == 'border') {
				rectMode(CENTER);
				square(pos.x, pos.y, diameter);
			}
		});
	});
}

function showTooltip(place) {
	textSize(LABEL_FONT_SIZE);

	var topText = place.id;
	if (place.use && topText.indexOf(place.use) == -1)
		topText += ' (' + place.use + ')';

	var bottomText = place.section;

	const labelX = VIEW.physPos.x + place.fxy.x * VIEW.zoom;
	const labelY = VIEW.physPos.y + place.fxy.y * VIEW.zoom;
	const
		tooltipW = max(textWidth(topText), textWidth(bottomText)) + LABEL_FONT_SIZE,
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
	if (showingDevTools && mouseHasMoved)
		rulerText = `FXY: ${FXYtoString(CURSOR.FXY)} ` + rulerText;
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
	
	// Apply view transformations
	translate(VIEW.physPos);
	scale(VIEW.zoom);

	// images
	noFill();
	imageMode(CORNER);

	hoveredPlace = null;
	if (showOptions[`show-site-plan`]) showSitePlan();
	if (showOptions[`show-floor-plan`]) showFloorPlan();
	showEdges();
	if (showingDevTools) showDevTools();
	if (showOptions[`show-labels`]) showLabels();

	pop();

	// Cursor
	cursor(cursorType);
	cursorType = ARROW;

	// Place dots (tooltips)
	if (hoveredPlace) showTooltip(hoveredPlace);

	showRuler();
};
