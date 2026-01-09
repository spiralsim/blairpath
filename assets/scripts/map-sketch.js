var canvas, images = {
	floors: [],
	site: null
};
const assetPath = "";

// Loads maps
function preload () {
	for (let i = 1; i <= 4; i++) images.floors.push(loadImage(`${assetPath}/maps/f${i}.png`));
	images.site = loadImage(`${assetPath}/maps/site.png`);
}

function getCanvasDivWidth() {
	return document.getElementById('canvas').getBoundingClientRect().width;
}

function inCanvas () {
	return mouseX > 0;
}

/**
 * Represents a point (`p5.Vector` or `Number[]`) as a human-readable string.
 * Each coordinate is rounded.
 */
function stringifyPoint(p) {
	if (!p) return '(None)';
	else if (p instanceof p5.Vector) return `(${round(p.x)}, ${round(p.y)})`;
	else if (p instanceof Array) return `(${p.map(c => round(c)).join(', ')})`;
	else throw new TypeError('p must be a p5.Vector or array of numbers');
}

function formatJSON (data) {
	return JSON.stringify(data, null, 4).replace(/ {4}/g, '\t');
}

// Compute / recompute the length of a link and adjust properties accordingly
function computeLength (link) {
	// If no valid points are given, both distances should be 0
	link.gLen = link.vLen = 0;
	if (!link.points[0] || !link.points[1]) return;

	if (link.points[0][2] == link.points[1][2]) link.gLen = dist(link.points[0][0], link.points[0][1], link.points[1][0], link.points[1][1]);
	else link.vLen = constants.METERS_PER_FLOOR / constants.METERS_PER_PIXEL;
}
// Delete a link #(id), remove all records of the link, etc.
function deleteLink (id) {
	links.forEach((link, idx) => {
		if (link.id == id) {
			// Remove this link from the list of links in the node(s) it was previous attached to, if applicable
			for (let i = 0; i < 2; i++) {
				if (link.nodes[i]) {
					var linkedNode = nodes.find(n => n.id == link.nodes[i]),
						currLinkIdx = linkedNode.links.indexOf(link.id);
					if (currLinkIdx >= 0) linkedNode.links.splice(currLinkIdx, 1);
				}
			}

			if (devData.link == link) devData.link = null;

			links.splice(idx, 1);
		}
	});
}
// Delete a node #(id), remove all records of the node, etc.
function deleteNode (id) { 
	nodes.forEach((node, idx) => {
		if (node.id == id) {
			// Unlink all attached links
			const linksToDelete = node.links.slice(0);
			linksToDelete.forEach(l => {
				deleteLink(l);
			});

			// Remove node from array
			nodes.splice(idx, 1);
			if (id == devData.node.id) devData.node = null;
		}
	});
}
// Split the link #(id) into two sub-links from a point [x, y] (p) on floor (f)
function splitLink (id, p, f) {
	links.forEach((link, idx) => {
		if (link.id == id) {
			// Create new node
			var newNode = {
				pos: p,
				floor: f,
				id: ~~(random(1000000))
			}, newLinks = [0, 1].map(i => {
				return {
					nodes: [link.nodes[i], newNode.id],
					points: [link.points[i], [... p, f]],
					id: ~~(random(1000000))
				};
			});
			// Register the new links in the new node
			newNode.links = newLinks.map(l => l.id);
			nodes.push(newNode);
			// Register the new links in the old nodes
			[0, 1].forEach(i => {
				nodes.find(n => n.id == link.nodes[i]).links.push(newLinks[i].id);
			});
			// Compute the lengths of the new links and add them to the array
			newLinks.forEach(l => {
				computeLength(l);
				links.push(l);
			});
			
			// Delete the current link
			deleteLink(id);
		}
	});
}
// Merge two links from a node #(id)
function mergeLinks (id) {
	nodes.forEach((node, idx) => {
		if (node.id == id) {
			const currLinks = node.links.map(l => links.find(link => link.id == l)),
			// Find the other nodes that the attached links are connected to
			      otherNodeIDs = currLinks.map(l => l.nodes.find(n => n != id)),
			      otherNodeObjs = otherNodeIDs.map(i => nodes.find(n => n.id == i));
			// Create new link
			var newLink = {
				nodes: otherNodeIDs,
				points: otherNodeObjs.map(n => [... n.pos, n.floor]),
				id: ~~(random(1000000))
			};
			computeLength(newLink);
			links.push(newLink);
			// Register new link in its nodes
			otherNodeObjs.forEach(n => n.links.push(newLink.id));
			
			// Delete the current node
			deleteNode(id);
		}
	});
}
// Compute distance between a point [x, y] (p) and segment [x, y] (a) - [x, y] (b)
// Adapted from https://stackoverflow.com/questions/849211/shortest-distance-between-a-point-and-a-line-segment
function distToLine ({ x: px, y: py }, { x: ax, y: ay }, { x: bx, y: by }) {
	var l = pow(dist(ax, ay, bx, by), 2);
	if (l == 0) return pow(dist(px, py, ax, ay), 2);
	var t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l;
	t = max(0, min(1, t));
	return dist(px, py, ax + t * (bx - ax), ay + t * (by - ay));
}

var loaded = false, lastFrameRate = 60, lastUpdate = framesSinceUpdate = 0;

/*
	Navigation
*/
var _floor = 1;
const MAP_DIM_TMP = [1083, 500],
	SITE_DIM_TMP = [2263, 1267],
	SITE_PLAN_OFFSET_TMP = [-525, -248];
var MAP_DIM,
	SITE_DIM,
	SITE_PLAN_OFFSET;
const DEFAULT_ZOOM = 1, SCROLL_ZOOM_RATE = 1.01;
// All positions are given as pixel coordinates

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
	pan(delta) {
		VIEW.physPos.add(delta);
	},
	applyZoom(scaleFactor, center = createVector(width / 2, height / 2)) {
		VIEW.physPos = p5.Vector.add(
			center, p5.Vector.sub(VIEW.physPos, center).mult(scaleFactor)
		);
		VIEW.zoom *= scaleFactor;
	},
	reset() {
		VIEW.zoom = DEFAULT_ZOOM;
		const CANVAS_CENTER = createVector(width / 2, height / 2);
		VIEW.physPos = CANVAS_CENTER.sub(p5.Vector.mult(MAP_DIM, VIEW.zoom / 2));
	}
};

const CURSOR = {
	get physPos() {
		return createVector(mouseX, mouseY);
	},
	get virtPos() {
		return p5.Vector.sub(CURSOR.physPos, VIEW.physPos).div(VIEW.zoom);
	}
};

var showOptions = {
	'show-floor-plan': null,
	'show-site-plan': null,
	'show-names': null,
	'show-dev-tools': null,
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
var hoveredRoom;

/*
	Developer Mode
*/
var devData = {
	room: null,
	node: null,
	link: null,
	awaiting: null, // Stores a user action that the program is waiting for, if applicable
	msg: { txt: null, r: null, g: null, a: 0 },
	pushMsg: (txt, type) => {
		if (type != 2) devData.awaiting = null;
		devData.msg = {
			txt: txt,
			r: (type == 0) * 255, // Red: error
			g: (type == 1) * 255, // Green: success
			b: (type == 2) * 255,  // Blue: awaiting user interaction
			a: 400
		};
	}
};

/**
 * Draws an arrow representing the vertical edge between `a` and `b`, pointing
 * in the direction of the endpoint not on the current floor.
 * @param {Vertex} a Vertex at the arrow's start point
 * @param {Vertex} b Vertex at the arrow's end point
 */
function drawArrow(a, b) {
	const dir = a.floor == _floor ? b.floor - _floor : a.floor - _floor;
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
function drawDottedLine(a, b) {
	const length = dist(a.x, a.y, b.x, b.y);
	for (let i = 0; i < length; i += 5 / VIEW.zoom)
		point(lerp(a.x, b.x, i / length), lerp(a.y, b.y, i / length));
}

/*
	p5.js Event Functions
*/
function setup() {
	canvas = createCanvas(getCanvasDivWidth(), windowHeight);
	canvas.parent("canvas");

	textFont('Roboto');

	MAP_DIM = createVector(...MAP_DIM_TMP);
	SITE_DIM = createVector(...SITE_DIM_TMP);
	SITE_PLAN_OFFSET = createVector(...SITE_PLAN_OFFSET_TMP);
	VIEW.reset();
};

function windowResized() {
	resizeCanvas(getCanvasDivWidth(), windowHeight);
}

function mousePressed() {
	const place = Object.values(places).find(p => p.hover);
	if (!place) return;
	// Handle edge case where there are no rows to begin with
	if (!rows.length) addPoint();
	// Find the number of the first empty point input
	for (let i = 1; i <= rows.length; i++) {
		if (!getRowValue(i)) {
			setRowValue(i, place.id);
			return;
		}
	}
	addPoint();
	setRowValue(rows.length, place.id);
};

function mouseDragged() {
	if (!inCanvas()) return;
	cursorType = MOVE;
	VIEW.pan(createVector(movedX, movedY));
};

function mouseWheel({ delta }) {
	if (!inCanvas()) return;
	VIEW.applyZoom(SCROLL_ZOOM_RATE ** -delta, CURSOR.physPos); // Uses negative sign to conform to Google Maps' zoom
};

const EDGE_WIDTH = 4;
/**
 * Draws an edge (segment, dotted, or arrow).
 * 
 * @param {Edge} edge
 * @param {p5.Color} _color
 */
function drawEdge({ endpoint1, endpoint2, isTemporary }, _color) {
	stroke(_color);
	fill(_color);
	strokeWeight(EDGE_WIDTH / VIEW.zoom);
	if (endpoint1.floor == endpoint2.floor) {
		if (isTemporary) drawDottedLine(endpoint1, endpoint2);
		else line(endpoint1.x, endpoint1.y, endpoint2.x, endpoint2.y);
	} else drawArrow(endpoint1, endpoint2);
}

function showSitePlan() {
	tint(255, 64);
	image(images.site, SITE_PLAN_OFFSET.x, SITE_PLAN_OFFSET.y);
	if (showOptions[`show-dev-tools`]) {
		stroke(0, 0, 255);
		rect(SITE_PLAN_OFFSET.x, SITE_PLAN_OFFSET.y, SITE_DIM.x, SITE_DIM.y);
	}
}

function showFloorPlan() {
	tint(255, 255);
	image(images.floors[_floor - 1], 0, 0);
	if (showOptions[`show-dev-tools`]) {
		stroke(255, 0, 0);
		rect(0, 0, MAP_DIM.x, MAP_DIM.y);
	}
}

function showPlaces() {
	textAlign(CENTER, CENTER);
	textSize(12 / VIEW.zoom);
	stroke(0);
	strokeWeight(1 / VIEW.zoom);
	// Display dots for room selection
	for (let id in places) {
		const place = places[id];
		place.hover = false;
		if (place.floor != _floor || !place.center) continue;
		// Display the point and detect hovering if applicable
		const nameWidth = textWidth(id);
		if (
			abs(CURSOR.virtPos.x - place.center[0]) < nameWidth / 2 &&
			abs(CURSOR.virtPos.y - place.center[1]) < 6 / VIEW.zoom &&
			!hoveredRoom
		) {
			hoveredRoom = place;
			place.hover = true;
			cursorType = HAND;
		}

		fill(255);
		if (place.hover) fill(mouseIsPressed ? color(250, 85, 85) : 128);
		
		text(id, place.center[0], place.center[1]);
	}

	// Display selected points
	stroke(255);
	fill(0);
	for (let i = 1; i <= rows.length; i++) {
		const id = getRowValue(i), place = places[id];
		if (!place || place.floor != _floor) continue;

		// Draw center, doors, etc.
		text(id, place.center[0], place.center[1]);
	}
}

function showDevTools() {
	var foundHoveredEdge = false;
	edges.forEach(e => {
		e.isHovered = false;
		if (e.endpoint1.floor != _floor && e.endpoint2.floor != _floor) return;
		if (!foundHoveredEdge) {
			e.checkHovered();
			foundHoveredEdge ||= e.isHovered;
		}
		drawEdge(e, color(e.isHovered ? 192 : 0));
	});
}

function showTooltip(room) {
	textSize(10);

	var topText = room.id;
	if (room.use && topText.indexOf(room.use) == -1)
		topText += ' (' + room.use + ')';

	var bottomText = room.section;

	const center = room.center;
	const
		tooltipW = max(textWidth(topText), textWidth(bottomText)) + 10,
		tooltipH = 30,
		tooltipX = constrain(
			VIEW.physPos.x + center[0] * VIEW.zoom,
			0,
			width - tooltipW,
		),
		tooltipY = constrain(
			VIEW.physPos.y + center[1] * VIEW.zoom + 15,
			0,
			height - tooltipH,
		);

	strokeWeight(1);
	fill(255, 255, 255, 230);
	rect(tooltipX - tooltipW / 2, tooltipY, tooltipW, tooltipH, 5);
	fill(0);
	textAlign(CENTER, TOP);
	noStroke();
	textStyle(BOLD);
	text(topText, tooltipX, tooltipY + 5);
	textStyle(NORMAL);
	text(bottomText, tooltipX, tooltipY + 15);
}

function draw() {
	// Remove loading message
	if (!loaded) {
		document.getElementById("map-placeholder").remove();
		loaded = true;
	}

	if (tableLoaded) {
		var canCalculate = rows.length >= 2;
		for (let i = 1; i <= rows.length; i++) {
			const input = document.getElementById("point-" + i);
			const isValid = !!places[input.value];
			canCalculate &&= isValid;
			const borderColor = isValid || !input.value ? '--var(border)' : 'red';
			input.setAttribute("style", `border-color: ${borderColor}`);
		}
		if (canCalculate) calcButton.removeAttribute('disabled');
		else calcButton.setAttribute('disabled', '');
	}

	background(255);

	// Map Display
	push();
	
	// Apply view transformations
	translate(VIEW.physPos);
	scale(VIEW.zoom);

	// images
	noFill();
	imageMode(CORNER);

	hoveredRoom = null;
	if (showOptions[`show-site-plan`]) showSitePlan();
	if (showOptions[`show-floor-plan`]) showFloorPlan();
	var foundHoveredEdge = false;
	edges.forEach(e => {
		if (e.endpoint1.floor != _floor && e.endpoint2.floor != _floor) return;
		if (showOptions[`show-dev-tools`]) {
			e.isHovered = false;
			if (!foundHoveredEdge) {
				e.checkHovered();
				foundHoveredEdge ||= e.isHovered;
			}
		}
		if (!pathEdges.has(e) && !showOptions[`show-dev-tools`])
			return;
		var _color = pathEdges.has(e) ? color(0, 128, 255) : color(0);
		if (e.isHovered) _color = lerpColor(_color, color(255), 0.75)
		drawEdge(e, _color);
	});
	if (showOptions[`show-names`]) showPlaces();

	pop();

	// Cursor
	cursor(cursorType);
	cursorType = ARROW;

	// Place dots (tooltips)
	if (hoveredRoom) showTooltip(hoveredRoom);
};
